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
    },
    additionalProperties: false,
};

const constants = Object.seal({
    supportedTargets: ["web", "node"],
});

async function rustWasmLoader(source) {
    // this loader is async
    const callback = this.async();

    // Get all required params from webpack
    const params = {
        fileNameStruct:
            this._compilation.outputOptions.webassemblyModuleFilename ||
            "[hash].module.wasm",
        baseFolder: this._compilation.options.context,
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

        if (constants.supportedTargets.indexOf(params.target) === -1) {
            throw new Error(
                `patch is not presented for this target (${params.target}). Please, create new Issue or check the documentation.`,
            );
        }

        const { base } = path.parse(path.normalize(params.resourcePath));

        // Create build folder and name with md5 of a source
        const tmp = os.tmpdir();
        const buildFolder = path.join(
            tmp,
            `${base}.${crypto.createHash("md5").update(source).digest("hex")}`,
        );

        // create required folders for build
        if (!fs.existsSync(buildFolder)) {
            fs.mkdirSync(buildFolder, { recursive: true });
        }

        // Create name of wasm file
        const wasmName = loaderUtils.interpolateName(
            this,
            params.fileNameStruct,
            {
                content: source,
            },
        );

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

        const content = await pack(
            {
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
            },
            this.emitFile,
        );

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
