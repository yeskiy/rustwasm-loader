const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const loaderUtils = require("loader-utils");
const schemaUtils = require("schema-utils");
const { merge } = require("lodash");
const pack = require("./pack");
const buildInputsHash = require("./utils/buildInputsHash.util");
const edgeWasmPath = require("./utils/edgeCache.util");

const { cargoManifestsFor, watchFilesFor } = buildInputsHash;
const withBuildLock = require("./utils/buildLock.util");
const bun = require("./bun");
const esbuild = require("./esbuild");
const rollup = require("./rollup");
const vite = require("./vite");
const next = require("./next");

const optionsSchema = {
    type: "object",
    properties: {
        web: {
            description: "Options, which used for `web` target",
            type: "object",
            properties: {
                asyncLoading: {
                    type: "boolean",
                    description:
                        "enables load `.wasm` file asynchronously, instead of bundling in .js file",
                },
                wasmPathModifier: {
                    type: "array",
                    minItems: 1,
                },
                publicPath: {
                    type: "boolean",
                },
            },
            additionalProperties: false,
        },
        node: {
            description: "Options, which used for `node` target",
            type: "object",
            properties: {
                bundle: {
                    type: "boolean",
                    description: "Bundle `.wasm` file in `.js` file",
                },
            },
            additionalProperties: false,
        },
        target: {
            type: "string",
            enum: ["web", "node"],
            description:
                "Build target (`web` or `node`). Overrides webpack's `target` when set.",
        },
        logLevel: {
            type: "string",
            description:
                "Log Level (`verbose`, `info`, `warn`, `error`, `quiet`)",
        },
        types: {
            type: "boolean",
            description:
                "Also write the `<name>.d.rs.ts` sidecar next to each `.rs` source during the build (off by default)",
        },
        import: {
            description:
                'Opt-in import-based wasm delivery. `strategy: "module"` ships the wasm as a pre-compiled WebAssembly.Module via a `?module` import, the only form the Next.js Edge runtime can instantiate.',
            type: "object",
            properties: {
                strategy: {
                    type: "string",
                    enum: ["module"],
                },
            },
            required: ["strategy"],
            additionalProperties: false,
        },
    },
    additionalProperties: false,
};

const constants = Object.seal({
    supportedTargets: ["web", "node"],
    electronTargets: {
        "electron-main": "node",
        "electron-preload": "node",
        "electron-renderer": "web",
    },
});

// The binding the Edge glue starts from. The preamble imports the compiled module into it with `?module`.
const moduleBinding = "__wbg_wasm_module";

// The module delivery emits no asset. A no-op is necessary, because the Turbopack loader context has no `emitFile`.
const noopEmit = () => undefined;

// Builds, copies the wasm to a project cache file named by the input digest, then rebuilds the glue around a
// `?module` import, the only wasm form the Edge runtime accepts. The lock covers both passes and the copy.
async function buildModuleDelivery(basePackParams, inputsHash, addDependency) {
    return withBuildLock(basePackParams.buildFolder, async () => {
        await pack(basePackParams, noopEmit);
        const cachePath = edgeWasmPath(basePackParams.baseFolder, inputsHash);
        fs.mkdirSync(path.dirname(cachePath), { recursive: true });
        const bytes = fs.readFileSync(
            path.join(
                basePackParams.buildFolder,
                "pkg",
                basePackParams.wasmName,
            ),
        );
        // A file with this digest name already holds these bytes. Do not rewrite it, because
        // a new timestamp on a declared dependency starts another rebuild in watch mode.
        if (
            !fs.existsSync(cachePath) ||
            !fs.readFileSync(cachePath).equals(bytes)
        ) {
            fs.writeFileSync(cachePath, bytes);
        }
        addDependency(cachePath);
        // Turbopack applies its `.wasm?module` transform only to a relative specifier.
        // It treats an absolute path as an external native module, which does not load.
        const relativeWasm = path
            .relative(path.dirname(basePackParams.resourcePath), cachePath)
            .split(path.sep)
            .join("/");
        const wasmSpecifier = relativeWasm.startsWith(".")
            ? `${relativeWasm}?module`
            : `./${relativeWasm}?module`;
        return pack(
            {
                ...basePackParams,
                import: {
                    strategy: "module",
                    urlExpression: moduleBinding,
                    preamble: `import ${moduleBinding} from ${JSON.stringify(wasmSpecifier)};`,
                },
            },
            noopEmit,
        );
    });
}

// Webpack and Rspack supply `_compilation`. Turbopack does not, so the plain
// loader-context fields are the fallback.
const loaderParams = (loaderContext) => ({
    fileNameStruct:
        loaderContext._compilation?.outputOptions?.webassemblyModuleFilename ||
        "[hash].module.wasm",
    baseFolder:
        loaderContext._compilation?.options?.context ||
        loaderContext.rootContext ||
        process.cwd(),
    resourcePath: loaderContext.resourcePath,
});

// The loader option overrides the host target. Webpack reduces a versioned Electron
// target, for example `electron20-main`, to one of the `electronTargets` keys.
function resolveTarget(optionTarget, contextTarget) {
    const requested = optionTarget ?? contextTarget;
    const target = constants.electronTargets[requested] ?? requested;

    if (!constants.supportedTargets.includes(target)) {
        throw new Error(
            `patch is not presented for this target (${target}). Please, create new Issue or check the documentation.`,
        );
    }

    return target;
}

// The Bun, esbuild, Rollup, and Vite paths have no `addDependency`, so they get a no-op.
const dependencyDeclarer = (loaderContext) =>
    typeof loaderContext.addDependency === "function"
        ? (file) => loaderContext.addDependency(file)
        : () => undefined;

// One dir for each target and delivery, because Next builds the server, client, and Edge
// passes of one `.rs` at the same time, and Turbopack workers do not share the build queue.
function buildFolderFor(resourcePath, inputsHash, target, moduleDelivery) {
    const buildFolder = path.join(
        os.tmpdir(),
        `${path.parse(path.normalize(resourcePath)).base}.${inputsHash}.${
            moduleDelivery ? `${target}.module` : target
        }`,
    );

    if (!fs.existsSync(buildFolder)) {
        fs.mkdirSync(buildFolder, { recursive: true });
    }

    return buildFolder;
}

// `[hash]` is the crate-input digest. Turbopack cannot run `interpolateName`, so it
// gets a digest name, which only the inline path uses internally.
function resolveWasmName(loaderContext, fileNameStruct, inputsHash) {
    try {
        return loaderUtils.interpolateName(loaderContext, fileNameStruct, {
            content: inputsHash,
        });
    } catch (error) {
        if (loaderContext._compilation) {
            throw error;
        }
        return `${inputsHash}.module.wasm`;
    }
}

// Only the async web delivery fetches the asset at runtime and reads the public path.
// Every other delivery gets an empty string and does not read compilation internals.
function resolvePublicPath(loaderContext, webOptions, target, wasmName) {
    if (
        target !== "web" ||
        !webOptions.asyncLoading ||
        !webOptions.publicPath
    ) {
        return "";
    }

    const compilation = loaderContext._compilation;
    const webpackPublicPath = compilation.getAssetPath(
        compilation.outputOptions.publicPath,
        { hash: compilation.hash || "" },
    );

    return webpackPublicPath.trim() !== "" && webpackPublicPath !== "auto"
        ? webpackPublicPath
        : path
              .relative(
                  path.resolve(
                      compilation.options.output.path,
                      path.dirname(wasmName),
                  ),
                  compilation.options.output.path,
              )
              .split(path.sep)
              .join("/");
}

async function rustWasmLoader(source) {
    const callback = this.async();

    const params = loaderParams(this);

    try {
        const options = merge(
            {
                web: {
                    asyncLoading: false,
                    wasmPathModifier: ["/"],
                    publicPath: true,
                },
                node: {
                    bundle: false,
                },
                logLevel: "info",
            },
            this.getOptions(),
        );

        schemaUtils.validate(optionsSchema, options, {
            name: "rust-wasmpack-loader",
        });

        const target = resolveTarget(options.target, this.target);
        const moduleDelivery = options.import?.strategy === "module";

        // The output also depends on the cargo manifests. Declare them, so that a
        // dependency change rebuilds a cached module whose source did not change.
        const addDependency = dependencyDeclarer(this);
        cargoManifestsFor(params.resourcePath, params.baseFolder).forEach(
            addDependency,
        );

        const inputsHash = buildInputsHash(
            source,
            params.resourcePath,
            params.baseFolder,
        );
        const buildFolder = buildFolderFor(
            params.resourcePath,
            inputsHash,
            target,
            moduleDelivery,
        );
        const wasmName = resolveWasmName(
            this,
            params.fileNameStruct,
            inputsHash,
        );

        const basePackParams = {
            resourcePath: params.resourcePath,
            baseFolder: params.baseFolder,
            buildFolder,
            wasmName,
            target,
            logLevel: options.logLevel,
            emitTypes: options.types === true,
            web: {
                ...options.web,
                publicPath: resolvePublicPath(
                    this,
                    options.web,
                    target,
                    wasmName,
                ),
            },
            node: options.node,
        };

        const output = moduleDelivery
            ? await buildModuleDelivery(
                  basePackParams,
                  inputsHash,
                  addDependency,
              )
            : await pack(basePackParams, this.emitFile);
        // The build recorded the module files it compiled. An edit of one of them rebuilds.
        watchFilesFor(params.resourcePath, params.baseFolder).forEach(
            addDependency,
        );
        callback(null, output);
    } catch (e) {
        callback(e, null);
    }
}

rustWasmLoader.bun = bun;
rustWasmLoader.esbuild = esbuild;
rustWasmLoader.rollup = rollup;
rustWasmLoader.vite = vite;
rustWasmLoader.next = next;
module.exports = rustWasmLoader;
