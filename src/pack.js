const path = require("node:path");
const fs = require("node:fs");
const findNearestCargoBy = require("./utils/findNearestCargo.util");
const spawnWasmPack = require("./utils/spawnWasmPack.util");

const constants = Object.seal({
    toArrayBuffer: `function toArrayBuffer(buffer) {\n    const ab = new ArrayBuffer(buffer.length);\n    const view = new Uint8Array(ab);\n    for (var i = 0; i < buffer.length; ++i) {\n        view[i] = buffer[i];\n    }\n    return ab;\n}`,
    supportedTargets: ["web", "node"],
    CARGO_LOCK: "Cargo.lock",
    CARGO_TOML: "Cargo.toml",
});

function logLevelSelector(level) {
    switch (level) {
        case "quiet":
            return ["--quiet"];
        case "verbose":
            return ["--verbose"];
        default:
            return ["--log-level", level];
    }
}

/** @typedef {Object} WebOptions
 * @property {boolean} asyncLoading - async loading of the wasm file
 * @property {boolean} usePublicPath - use public path
 * @property {string} publicPath - path to the public folder (only for web target)
 * @property {string[]} wasmPathModifier - path to the wasm file
 * */

/** @typedef {Object} NodeOptions
 * @property {boolean} bundle - bundle the wasm file
 */

/** @typedef {Object} Options
 * @property {string} resourcePath - path to the resource
 * @property {string} baseFolder - path to the base folder
 * @property {string} buildFolder - path to the build folder
 * @property {string} wasmName - name of the wasm file
 * @property {string} target - target of the build
 * @property {string} logLevel - log level of the build
 * @property {WebOptions} web - web options
 * @property {NodeOptions} node - node options
 * */

/**
 * pack function
 * @param {Options} params
 * emitFile - function to emit file
 * */

module.exports = async function pack(params, emitFile) {
    // Get  dir from resources
    const { dir } = path.parse(path.normalize(params.resourcePath));

    // Set wasm build folder
    const wasmBuildSource = path.join(params.buildFolder, "pkg");

    // Find the nearest Cargo.toml file
    const cargoData = findNearestCargoBy(constants)(
        dir,
        path.normalize(params.baseFolder),
        path.normalize(params.resourcePath),
        params.buildFolder,
    );

    // Write files to build dir
    fs.writeFileSync(
        path.join(params.buildFolder, constants.CARGO_TOML),
        cargoData[constants.CARGO_TOML],
        {
            encoding: "utf8",
        },
    );

    // If got .lock file, also create it in the build folder
    if (cargoData[constants.CARGO_LOCK]) {
        fs.writeFileSync(
            path.join(params.buildFolder, constants.CARGO_LOCK),
            cargoData[constants.CARGO_LOCK],
            {
                encoding: "utf8",
            },
        );
    }

    // build .rs file to .wasm bin
    await spawnWasmPack({
        cwd: params.buildFolder,
        outDir: wasmBuildSource,
        outName: params.wasmName,
        args: [...logLevelSelector(params.logLevel)],
        // use `web` target because the generated file of this target modifies easily
        extraArgs: ["--target", "web", "--no-typescript"],
    });

    // Add generated .wasm binary to webpack files
    if (
        (params.target === "web" && params.web.asyncLoading) ||
        (params.target === "node" && !params.node.bundle)
    ) {
        emitFile(
            params.wasmName,
            fs.readFileSync(path.join(wasmBuildSource, params.wasmName)),
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
                            !!item.match(
                                /async function __wbg_init\(module_or_path\) {/g,
                            )?.length,
                    ),
                ),
                `const __wbg_init = {}`,
                `initSync(${
                    params.node.bundle
                        ? `{module:toArrayBuffer(${JSON.stringify(
                              fs
                                  .readFileSync(
                                      path.join(
                                          wasmBuildSource,
                                          params.wasmName,
                                      ),
                                  )
                                  .toJSON().data,
                          )})}`
                        : `{module:require('fs').readFileSync(require('path').join(__dirname, '${params.wasmName}'))}`
                });`,
                `const exportedFunctions = {${lines
                    .filter(
                        (item) =>
                            !!item.match(/export function .+ {$/g)?.length,
                    )
                    .map((item) => item.split("function")[1].split("(")[0])
                    .map((item) => `${item}:${item}`)
                    .join(",")}};`,
                ...(params.node.bundle ? [constants.toArrayBuffer] : []),
                `export default {...exportedFunctions, ...Object.entries(wasm).filter(([item]) => Object.keys(exportedFunctions).indexOf(item) === -1).reduce((acc, item) => ({...acc,[item[0]]: item[1]}), {})}`,
            ].join("\n")}`;
        },

        web: (generatedJs) => {
            const lines = generatedJs.replaceAll("_bg.wasm", "").split("\n");
            const clearMatch = params.web.asyncLoading
                ? /export { initSync }/g
                : /async function __wbg_init\(module_or_path\) {/g;
            const badImportIndex = lines.findIndex(
                (item) => !!item.match(/import.meta.url/g)?.length,
            );
            lines[badImportIndex] = `       input = "${path.posix.join(
                ...params.web.wasmPathModifier,
                ...(params.web.usePublicPath ? params.web.publicPath : []),
                params.wasmName,
            )}"`;
            const exportGen = `{...exportedFunctions, ...Object.entries(wasm).filter(([item]) => Object.keys(exportedFunctions).indexOf(item) === -1).reduce((acc, item) => ({...acc,[item[0]]: item[1]}), {})}`;
            return `${[
                ...lines.slice(
                    0,
                    lines.findIndex((item) => !!item.match(clearMatch)?.length),
                ),
                constants.toArrayBuffer,
                ...(params.web.asyncLoading
                    ? []
                    : [
                          `const __wbg_init = {}`,
                          `initSync(toArrayBuffer(${JSON.stringify(
                              fs
                                  .readFileSync(
                                      path.join(
                                          wasmBuildSource,
                                          params.wasmName,
                                      ),
                                  )
                                  .toJSON().data,
                          )}));`,
                      ]),
                `const exportedFunctions = {${lines
                    .filter(
                        (item) =>
                            !!item.match(/export function .+ {$/g)?.length,
                    )
                    .map((item) => item.split("function")[1].split("(")[0])
                    .map((item) => `${item}:${item}`)
                    .join(",")}};`,
                `export default ${
                    params.web.asyncLoading
                        ? `new Promise(async (resolve, reject)=> { try{await init(); resolve(${exportGen})}catch(e){reject(e)}})`
                        : exportGen
                }`,
            ].join("\n")}`;
        },
    };

    // read generated .js file
    const generatedJs = fs.readFileSync(
        path.join(
            wasmBuildSource,
            `${params.wasmName.replace(".wasm", "")}.js`,
        ),
        {
            encoding: "utf8",
        },
    );

    return patch[params.target](generatedJs);
};
