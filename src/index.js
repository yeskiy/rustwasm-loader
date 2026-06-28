const fs = require("node:fs");
const crypto = require("node:crypto");
const os = require("node:os");
const path = require("node:path");
const loaderUtils = require("loader-utils");
const schemaUtils = require("schema-utils");
const { merge } = require("lodash");
const pack = require("./pack");
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
 * @param {import("./pack").Options} basePackParams
 * @param {string} sourceHash
 * @returns {Promise<string>}
 */
async function buildModuleDelivery(basePackParams, sourceHash) {
    await pack(basePackParams, noopEmit);
    const cacheDir = path.join(
        basePackParams.baseFolder,
        "node_modules",
        ".cache",
        "rust-wasmpack-loader",
    );
    fs.mkdirSync(cacheDir, { recursive: true });
    const cachePath = path.join(cacheDir, `${sourceHash}.wasm`);
    fs.copyFileSync(
        path.join(basePackParams.buildFolder, "pkg", basePackParams.wasmName),
        cachePath,
    );
    // Reference the cache file relatively to the `.rs` resource. Turbopack only
    // applies its native `.wasm?module` transform to in-tree relative specifiers
    // (an absolute path is treated as an external native module and fails to
    // load); webpack resolves the relative specifier against the resource too.
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
}

async function rustWasmLoader(source) {
    // this loader is async
    const callback = this.async();

    // Webpack/Rspack expose `_compilation`; Turbopack's core loader API does not.
    // When it is present the values below are byte-identical to before; when it is
    // absent we fall back to plain loader-context fields so the inline path still runs.
    const compilation = this._compilation;
    const params = {
        fileNameStruct:
            compilation?.outputOptions?.webassemblyModuleFilename ||
            "[hash].module.wasm",
        baseFolder:
            compilation?.options?.context || this.rootContext || process.cwd(),
        resourcePath: this.resourcePath,
    };

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

        // Loader option wins; fall back to webpack's own target.
        params.target = options.target ?? this.target;

        // Electron's webpack targets map onto the two strategies we already have:
        // the main and preload processes are Node, the renderer is a browser. Both
        // build with inlined bytes. webpack normalizes versioned targets (e.g.
        // `electron20-main`) down to these three strings before the loader sees them.
        params.target =
            constants.electronTargets[params.target] ?? params.target;

        if (!constants.supportedTargets.includes(params.target)) {
            throw new Error(
                `patch is not presented for this target (${params.target}). Please, create new Issue or check the documentation.`,
            );
        }

        const { base } = path.parse(path.normalize(params.resourcePath));

        // Per-source, per-target temp build dir. Keying on the target as well as
        // the source hash keeps concurrent builds of the same `.rs` for different
        // environments (Next runs the server and client passes in parallel) in
        // separate directories, so their wasm-pack runs never collide. The `module`
        // delivery shares the `web` target with the browser build but runs in its
        // own Turbopack worker, where the in-process build queue cannot serialize
        // it, so it gets a distinct dir too.
        const tmp = os.tmpdir();
        const sourceHash = crypto
            .createHash("sha256")
            .update(source)
            .digest("hex");
        const buildVariant =
            options.import?.strategy === "module"
                ? `${params.target}.module`
                : params.target;
        const buildFolder = path.join(
            tmp,
            `${base}.${sourceHash}.${buildVariant}`,
        );

        // create required folders for build
        if (!fs.existsSync(buildFolder)) {
            fs.mkdirSync(buildFolder, { recursive: true });
        }

        // Create name of wasm file. Webpack/Rspack feed it through
        // `interpolateName`; under Turbopack (no compilation) the loader context
        // is thinner, so if interpolation cannot run we derive a content-hashed
        // name directly. The name is internal scratch for the inline path and
        // never surfaces, so the exact shape does not matter.
        const wasmName = compilation
            ? loaderUtils.interpolateName(this, params.fileNameStruct, {
                  content: source,
              })
            : (() => {
                  try {
                      return loaderUtils.interpolateName(
                          this,
                          params.fileNameStruct,
                          { content: source },
                      );
                  } catch {
                      return `${sourceHash}.module.wasm`;
                  }
              })();

        // Resolve publicPath only for the web path that actually fetches the
        // emitted asset at runtime; every other delivery slices it off, so it
        // stays empty and we avoid dereferencing compilation internals.
        const publicPath =
            params.target === "web" && options.web.asyncLoading
                ? (() => {
                      const webpackPublicPath = this._compilation.getAssetPath(
                          this._compilation.outputOptions.publicPath,
                          { hash: this._compilation.hash || "" },
                      );
                      return webpackPublicPath.trim() !== "" &&
                          webpackPublicPath !== "auto"
                          ? webpackPublicPath
                          : path
                                .relative(
                                    path.resolve(
                                        this._compilation.options.output.path,
                                        path.dirname(
                                            this._compilation.getAssetPath(
                                                wasmName,
                                                this.context,
                                            ),
                                        ),
                                    ),
                                    this._compilation.options.output.path,
                                )
                                .split(path.sep)
                                .join("/");
                  })()
                : "";

        const basePackParams = {
            resourcePath: params.resourcePath,
            baseFolder: params.baseFolder,
            buildFolder,
            wasmName,
            target: params.target,
            logLevel: options.logLevel,
            web: {
                ...options.web,
                publicPath,
            },
            node: options.node,
        };

        const content =
            options.import?.strategy === "module"
                ? await buildModuleDelivery(basePackParams, sourceHash)
                : await pack(basePackParams, this.emitFile);

        callback(null, content);
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
