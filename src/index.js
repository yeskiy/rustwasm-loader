const fs = require("fs");
const loaderUtils = require("loader-utils");
const schemaUtils = require("schema-utils");
const path = require("path");
const crypto = require("crypto");
const os = require("os");
const spawnWasmPack = require("./utils/spawnWasmPack.util");
const findNearestCargoBy = require("./utils/findNearestCargo.util");

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
                publicPath: "boolean",
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
    },
    additionalProperties: false,
};

const constants = Object.seal({
    CARGO_LOCK: "Cargo.lock",
    CARGO_TOML: "Cargo.toml",
});

module.exports = async function rustWasmLoader(source) {
    const passedOptions = this.getOptions();
    const options = {
        web: {
            ...(passedOptions.web || {
                asyncLoading: false,
                wasmPathModifier: ["/"],
                publicPath: true,
            }),
        },
        node: {
            ...(passedOptions.node || {
                bundle: false,
            }),
        },
    };
    schemaUtils.validate(optionsSchema, options, {
        name: "rust-wasmpack-loader",
    });

    const callback = this.async();

    try {
        // Get all required values from webpack
        const values = {
            fileNameStruct:
                this._compilation.outputOptions.webassemblyModuleFilename,
            baseFolder: this._compilation.options.context,
            resourcePath: this.resourcePath,
            target: this.target,
        };

        // Get base and dir from resources
        const { base, dir } = path.parse(path.normalize(values.resourcePath));

        // Create name of wasm file
        const wasmName = loaderUtils.interpolateName(
            this,
            values.fileNameStruct,
            {
                content: source,
            }
        );

        // Create build folder and name with md5 of source
        const tmp = os.tmpdir();
        const buildFolder = path.join(
            tmp,
            `${base}.${crypto.createHash("md5").update(source).digest("hex")}`
        );
        const wasmBuildSource = path.join(buildFolder, "pkg");

        if (!fs.existsSync(buildFolder)) {
            fs.mkdirSync(buildFolder, { recursive: true });
        }

        // Find the nearest Cargo.toml file
        const cargoData = findNearestCargoBy(constants)(
            dir,
            path.normalize(values.baseFolder),
            path.normalize(values.resourcePath),
            buildFolder
        );

        // Write files to build dir
        fs.writeFileSync(
            path.join(buildFolder, constants.CARGO_TOML),
            cargoData[constants.CARGO_TOML],
            {
                encoding: "utf8",
            }
        );

        // If got .lock file, also create it in build folder
        if (cargoData[constants.CARGO_LOCK]) {
            fs.writeFileSync(
                path.join(buildFolder, constants.CARGO_LOCK),
                cargoData[constants.CARGO_LOCK],
                {
                    encoding: "utf8",
                }
            );
        }

        // build .rs file to .wasm bin
        await spawnWasmPack({
            cwd: buildFolder,
            outDir: wasmBuildSource,
            outName: wasmName,
            extraArgs: ["--target", "web", "--no-typescript"],
        });

        // Add generated .wasm bin to webpack files
        if (
            (values.target === "web" && options.web.asyncLoading) ||
            (values.target === "node" && !options.node.bundle)
        ) {
            this.emitFile(
                wasmName,
                fs.readFileSync(path.join(wasmBuildSource, wasmName))
            );
        }

        // Find publicPath
        const webpackPublicPath = this._compilation.getAssetPath(
            this._compilation.outputOptions.publicPath,
            { hash: this._compilation.hash }
        );
        const publicPath =
            webpackPublicPath.trim() !== "" && webpackPublicPath !== "auto"
                ? webpackPublicPath
                : path
                      .relative(
                          path.resolve(
                              this._compilation.options.output.path,
                              path.dirname(
                                  this._compilation.getAssetPath(
                                      wasmName,
                                      this.context
                                  )
                              )
                          ),
                          this._compilation.options.output.path
                      )
                      .split(path.sep)
                      .join("/");

        // update generated .js script by wasm to remove bad imports and resolve native rs functions without __wasm ident
        const toArrayBuffer = `function toArrayBuffer(buffer) {\n    const ab = new ArrayBuffer(buffer.length);\n    const view = new Uint8Array(ab);\n    for (var i = 0; i < buffer.length; ++i) {\n        view[i] = buffer[i];\n    }\n    return ab;\n}`;
        const patch = {
            node: (generatedJs) => {
                const lines = generatedJs.split("\n");
                return `${[
                    ...lines.slice(
                        0,
                        lines.findIndex(
                            (item) =>
                                !!item.match(/async function init\(input\) {/g)
                                    ?.length
                        )
                    ),
                    `const init = {}`,
                    `initSync(${
                        options.node.bundle
                            ? `toArrayBuffer(${JSON.stringify(
                                  fs
                                      .readFileSync(
                                          path.join(wasmBuildSource, wasmName)
                                      )
                                      .toJSON().data
                              )})`
                            : `require('fs').readFileSync(require('path').join(__dirname, '${wasmName}'))`
                    });`,
                    `const exportedFunctions = {${lines
                        .filter(
                            (item) =>
                                !!item.match(/export function .+ {$/g)?.length
                        )
                        .map((item) => item.split("function")[1].split("(")[0])
                        .map((item) => `${item}:${item}`)
                        .join(",")}};`,
                    ...(options.node.bundle ? [toArrayBuffer] : []),
                    `export default {...exportedFunctions, ...Object.entries(wasm).filter(([item]) => Object.keys(exportedFunctions).indexOf(item) === -1).reduce((acc, item) => ({...acc,[item[0]]: item[1]}), {})}`,
                ].join("\n")}`;
            },

            web: (generatedJs) => {
                const lines = generatedJs
                    .replaceAll("_bg.wasm", "")
                    .split("\n");
                const clearMatch = options.web.asyncLoading
                    ? /export { initSync }/g
                    : /async function init\(input\) {/g;
                const badImportIndex = lines.findIndex(
                    (item) => !!item.match(/import.meta.url/g)?.length
                );
                lines[badImportIndex] = `       input = "${path.posix.join(
                    ...options.web.wasmPathModifier,
                    ...(options.web.publicPath ? publicPath : []),
                    wasmName
                )}"`;
                const exportGen = `{...exportedFunctions, ...Object.entries(wasm).filter(([item]) => Object.keys(exportedFunctions).indexOf(item) === -1).reduce((acc, item) => ({...acc,[item[0]]: item[1]}), {})}`;
                return `${[
                    ...lines.slice(
                        0,
                        lines.findIndex(
                            (item) => !!item.match(clearMatch)?.length
                        )
                    ),
                    toArrayBuffer,
                    ...(options.web.asyncLoading
                        ? []
                        : [
                              `const init = {}`,
                              `initSync(toArrayBuffer(${JSON.stringify(
                                  fs
                                      .readFileSync(
                                          path.join(wasmBuildSource, wasmName)
                                      )
                                      .toJSON().data
                              )}));`,
                          ]),
                    `const exportedFunctions = {${lines
                        .filter(
                            (item) =>
                                !!item.match(/export function .+ {$/g)?.length
                        )
                        .map((item) => item.split("function")[1].split("(")[0])
                        .map((item) => `${item}:${item}`)
                        .join(",")}};`,
                    `export default ${
                        options.web.asyncLoading
                            ? `new Promise(async (resolve, reject)=> { try{await init(); resolve(${exportGen})}catch(e){reject(e)}})`
                            : exportGen
                    }`,
                ].join("\n")}`;
            },
        };

        if (!patch[values.target]) {
            throw new Error(
                `patch is not presented for this target (${values.target}). Please, create new Issue or check the documentation.`
            );
        }
        // take generated .js file
        const generatedJs = fs.readFileSync(
            path.join(wasmBuildSource, `${wasmName.replace(".wasm", "")}.js`),
            {
                encoding: "utf8",
            }
        );
        callback(null, patch[values.target](generatedJs));
    } catch (e) {
        callback(e, null);
    }
};
