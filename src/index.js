const fs = require("fs");
const loaderUtils = require("loader-utils");
const path = require("path");
const crypto = require("crypto");
const os = require("os");
const spawnWasmPack = require("./utils/spawnWasmPack.util");
const findNearestCargoBy = require("./utils/findNearestCargo.util");

const constants = Object.seal({
    CARGO_LOCK: "Cargo.lock",
    CARGO_TOML: "Cargo.toml",
});

module.exports = async function rustWasmLoader(source) {
    const callback = this.async();

    try {
        // Get all required values from webpack
        const values = {
            outputPath: this._compilation.outputOptions.path,
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
        if (values.target !== "web") {
            this.emitFile(
                wasmName,
                fs.readFileSync(path.join(wasmBuildSource, wasmName))
            );
        }

        // update generated .js script by wasm to remove bad imports and resolve native rs functions without __wasm ident
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
                    `const exportedFunctions = {${lines
                        .filter(
                            (item) =>
                                !!item.match(/export function .+ {$/g)?.length
                        )
                        .map((item) => item.split("function")[1].split("(")[0])
                        .map((item) => `${item}:${item}`)
                        .join(",")}};`,
                    `initSync(require('fs').readFileSync(require('path').join(__dirname, '${wasmName}')));`,
                    `export default {...exportedFunctions, ...Object.entries(wasm).filter(([item]) => Object.keys(exportedFunctions).indexOf(item) === -1).reduce((acc, item) => ({...acc,[item[0]]: item[1]}), {})}`,
                ].join("\n")}`;
            },

            web: (generatedJs) => {
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
                    `function toArrayBuffer(buffer) {\n    const ab = new ArrayBuffer(buffer.length);\n    const view = new Uint8Array(ab);\n    for (var i = 0; i < buffer.length; ++i) {\n        view[i] = buffer[i];\n    }\n    return ab;\n}`,
                    `const init = {}`,
                    `const exportedFunctions = {${lines
                        .filter(
                            (item) =>
                                !!item.match(/export function .+ {$/g)?.length
                        )
                        .map((item) => item.split("function")[1].split("(")[0])
                        .map((item) => `${item}:${item}`)
                        .join(",")}};`,
                    `initSync(toArrayBuffer(${JSON.stringify(
                        fs
                            .readFileSync(path.join(wasmBuildSource, wasmName))
                            .toJSON().data
                    )}));`,
                    `export default {...exportedFunctions, ...Object.entries(wasm).filter(([item]) => Object.keys(exportedFunctions).indexOf(item) === -1).reduce((acc, item) => ({...acc,[item[0]]: item[1]}), {})}`,
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
