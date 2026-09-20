const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const loaderUtils = require("loader-utils");
const schemaUtils = require("schema-utils");
const { merge } = require("lodash");
const pack = require("./pack");
const buildInputsHash = require("./utils/buildInputsHash.util");
const edgeWasmPath = require("./utils/edgeCache.util");

const { cargoManifestsFor } = buildInputsHash;
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

// The import binding the generated Edge glue inits from; the preamble pulls the
// pre-compiled module into it via `?module`.
const moduleBinding = "__wbg_wasm_module";

// Neither delivery this loader emits through pack (inline first pass, then
// import) calls back, so a no-op keeps the module path independent of
// `this.emitFile`, which Turbopack's loader context omits.
const noopEmit = () => undefined;

/**
 * Edge delivery: the wasm reaches the Edge bundle as a pre-compiled
 * WebAssembly.Module through a `?module` import, the only form the Edge runtime
 * can instantiate. Build once so the bytes land in the temp pkg dir, copy them to
 * a project-local cache path both bundlers can resolve, then regenerate the glue
 * around an `import <binding> from "<cache>?module"` line. The second pass is a
 * wasm-pack cache hit on the same content-addressed dir, so Rust never recompiles.
 * The build-folder lock spans both passes and the copy between them. No other
 * process can rewrite the pkg dir while the bytes are read out of it.
 *
 * The build-input digest names the cache file, so a crate whose dependencies
 * changed reaches the bundler under a specifier of its own. A bundler that
 * caches the compiled module against the specifier then compiles the current
 * wasm rather than serving the module of the dependency set before it, which no
 * longer matches the glue.
 * @param {import("./pack").Options} basePackParams
 * @param {string} inputsHash the crate-input digest that names the cache file
 * @param {(file: string) => void} addDependency declares a build dependency, or does nothing on a host without a loader context
 * @returns {Promise<string>}
 */
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
        // The name carries the input digest, so a file already here holds this
        // build's bytes. Rewriting it would only move its timestamp, and the
        // loader declares it below, which turns a moved timestamp into another
        // rebuild in watch mode.
        if (
            !fs.existsSync(cachePath) ||
            !fs.readFileSync(cachePath).equals(bytes)
        ) {
            fs.writeFileSync(cachePath, bytes);
        }
        addDependency(cachePath);
        // Reference the cache file relatively to the `.rs` resource. Turbopack
        // only applies its native `.wasm?module` transform to in-tree relative
        // specifiers (an absolute path is treated as an external native module
        // and fails to load). Webpack resolves the relative specifier against
        // the resource too.
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

/**
 * Reads the values the loader takes from its host. Webpack and Rspack expose
 * `_compilation`, and Turbopack's core loader API does not. When it is present the
 * values are the webpack ones. When it is absent the plain loader-context
 * fields keep the inline path running.
 * @param {object} loaderContext the loader `this`
 * @returns {{fileNameStruct: string, baseFolder: string, resourcePath: string}}
 */
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

/**
 * Picks the build strategy. The loader option wins over the host's own target.
 *
 * Electron's webpack targets map onto the two strategies we already have: the
 * main and preload processes are Node, the renderer is a browser. Both build
 * with inlined bytes. webpack normalizes versioned targets (for example
 * `electron20-main`) down to these three strings before the loader sees them.
 * @param {string|undefined} optionTarget the `target` loader option
 * @param {string|undefined} contextTarget the target the host declares
 * @returns {string} `web` or `node`
 */
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

/**
 * Declares a build dependency on a host that has a loader context, and does
 * nothing on a host that has not. Only the webpack-style hosts supply the call.
 * The Bun, esbuild, Rollup and Vite paths have no loader context.
 * @param {object} loaderContext the loader `this`
 * @returns {(file: string) => void}
 */
const dependencyDeclarer = (loaderContext) =>
    typeof loaderContext.addDependency === "function"
        ? (file) => loaderContext.addDependency(file)
        : () => undefined;

/**
 * Makes the per-source, per-target temp build dir and returns it. Keying on the
 * target as well as the build inputs keeps concurrent builds of the same `.rs`
 * for different environments (Next runs the server and client passes in
 * parallel) in separate directories, so their wasm-pack runs never collide. The
 * `module` delivery shares the `web` target with the browser build but runs in
 * its own Turbopack worker, where the in-process build queue cannot serialize
 * it, so it gets a distinct dir too.
 * @param {string} resourcePath absolute path of the `.rs` file
 * @param {string} inputsHash the crate-input digest
 * @param {string} target `web` or `node`
 * @param {boolean} moduleDelivery true for the Edge `module` delivery
 * @returns {string} absolute path of the build dir
 */
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

/**
 * Names the wasm file. Webpack and Rspack feed it through `interpolateName`.
 * Under Turbopack the loader context is thinner, so when interpolation cannot
 * run we derive a content-hashed name directly. The name is internal scratch
 * for the inline path and never surfaces, so the exact shape does not matter.
 * A host that has a compilation gets the interpolation error itself.
 * @param {object} loaderContext the loader `this`
 * @param {string} fileNameStruct the name template
 * @param {string|Buffer} source the `.rs` source
 * @param {string} inputsHash the crate-input digest
 * @returns {string}
 */
function resolveWasmName(loaderContext, fileNameStruct, source, inputsHash) {
    try {
        return loaderUtils.interpolateName(loaderContext, fileNameStruct, {
            content: source,
        });
    } catch (error) {
        if (loaderContext._compilation) {
            throw error;
        }
        return `${inputsHash}.module.wasm`;
    }
}

/**
 * Resolves the public path for the one web delivery that fetches the emitted
 * asset at runtime. Every other delivery slices it off, so it stays empty and
 * we avoid dereferencing compilation internals. The `web.publicPath` option is
 * the documented opt-out.
 * @param {object} loaderContext the loader `this`
 * @param {object} webOptions the `web` loader options
 * @param {string} target `web` or `node`
 * @param {string} wasmName the emitted asset name
 * @returns {string}
 */
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
    // this loader is async
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

        // The generated module is a function of the `.rs` source and of the
        // cargo manifests beside it, so the manifests are build dependencies.
        // Without them a bundler reuses the module it cached against an
        // unchanged source and never rebuilds the wasm after a dependency
        // change.
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
            source,
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

        callback(
            null,
            moduleDelivery
                ? await buildModuleDelivery(
                      basePackParams,
                      inputsHash,
                      addDependency,
                  )
                : await pack(basePackParams, this.emitFile),
        );
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
