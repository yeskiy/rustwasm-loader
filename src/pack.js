const path = require("node:path");
const fs = require("node:fs");
const findNearestCargoBy = require("./utils/findNearestCargo.util");
const spawnWasmPack = require("./utils/spawnWasmPack.util");
const writeSidecar = require("./utils/writeSidecar.util");
const stripGlueFooter = require("./utils/stripGlueFooter.util");
const stripTypesBanner = require("./utils/stripTypesBanner.util");
const buildGlueImports = require("./utils/buildGlueImports.util");
const buildExportedBindings = require("./utils/buildExportedBindings.util");
const buildWasmUrl = require("./utils/buildWasmUrl.util");
const withBuildLock = require("./utils/buildLock.util");
const { recordSources } = require("./utils/rustSources.util");

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

// The default-export body: the named Rust exports over the remaining `wasm` bindings.
// Every delivery uses it, so the module shape is the same.
const exportGenExpr = `{...exportedFunctions, ...Object.entries(wasm).filter(([item]) => Object.keys(exportedFunctions).indexOf(item) === -1).reduce((acc, item) => ({...acc,[item[0]]: item[1]}), {})}`;

// Selects the wasm delivery from the target and its options. The loader uses
// `import` only when `params.import` is set: the host bundler then supplies the wasm.
function selectDelivery(params) {
    if (params.import) {
        return "import";
    }
    if (params.target === "web") {
        return params.web.asyncLoading ? "fetch" : "inline";
    }
    return params.node.bundle ? "inline" : "fsread";
}

// Deliveries that emit the .wasm as a separate asset, which the host reads at runtime.
const assetEmittingDeliveries = new Set(["fetch", "fsread"]);

async function doPack(params, emitFile) {
    // Get  dir from resources
    const { dir } = path.parse(path.normalize(params.resourcePath));

    // Set wasm build folder
    const wasmBuildSource = path.join(params.buildFolder, "pkg");

    const delivery = selectDelivery(params);

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
        // Keep the wasm-bindgen `.d.ts` only when the typings sidecar is requested.
        typescript: !!params.emitTypes,
        args: [...logLevelSelector(params.logLevel)],
        // use `web` target because the generated file of this target modifies easily
        extraArgs: ["--target", "web"],
    });

    // Record the module files cargo compiled, so the next digest and watch list cover them.
    recordSources(params.resourcePath, params.buildFolder);

    // Add generated .wasm binary to webpack files
    if (assetEmittingDeliveries.has(delivery)) {
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
                buildExportedBindings(lines),
                ...(params.node.bundle ? [constants.toArrayBuffer] : []),
                `export default {...exportedFunctions, ...Object.entries(wasm).filter(([item]) => Object.keys(exportedFunctions).indexOf(item) === -1).reduce((acc, item) => ({...acc,[item[0]]: item[1]}), {})}`,
            ].join("\n")}`;
        },

        web: (generatedJs) => {
            const lines = generatedJs.replaceAll("_bg.wasm", "").split("\n");
            const badImportIndex = lines.findIndex(
                (item) => !!item.match(/import.meta.url/g)?.length,
            );
            lines[badImportIndex] = `        module_or_path = ${JSON.stringify(
                buildWasmUrl(
                    params.web.wasmPathModifier,
                    params.web.publicPath,
                    params.wasmName,
                ),
            )};`;
            // Async loading keeps the wasm-bindgen `__wbg_init` and drops only the export footer.
            // Inline mode cuts at the bootstrap, because it gives the bytes to `initSync`.
            const keptLines = params.web.asyncLoading
                ? stripGlueFooter(lines)
                : lines.slice(
                      0,
                      lines.findIndex(
                          (item) =>
                              !!item.match(
                                  /async function __wbg_init\(module_or_path\) {/g,
                              )?.length,
                      ),
                  );
            const exportGen = `{...exportedFunctions, ...Object.entries(wasm).filter(([item]) => Object.keys(exportedFunctions).indexOf(item) === -1).reduce((acc, item) => ({...acc,[item[0]]: item[1]}), {})}`;
            return `${[
                ...keptLines,
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
                buildExportedBindings(lines),
                `export default ${
                    params.web.asyncLoading
                        ? `new Promise(async (resolve, reject)=> { try{await __wbg_init(); resolve(${exportGen})}catch(e){reject(e)}})`
                        : exportGen
                }`,
            ].join("\n")}`;
        },

        // The host bundler resolves the .wasm. `urlExpression` is its URL for fetch and fs,
        // or a compiled `WebAssembly.Module` for the `module` strategy.
        import: (generatedJs) => {
            const { urlExpression, strategy, preamble } = params.import;
            const lines = generatedJs.replaceAll("_bg.wasm", "").split("\n");
            const exportedFunctions = buildExportedBindings(lines);
            // `fetch` gives the host asset URL to the wasm-bindgen loader and exports a Promise.
            // The sync strategies strip the bootstrap and start the wasm in place.
            const body =
                strategy === "fetch"
                    ? (() => {
                          const badImportIndex = lines.findIndex(
                              (item) =>
                                  !!item.match(/import.meta.url/g)?.length,
                          );
                          lines[badImportIndex] =
                              `        module_or_path = ${urlExpression};`;
                          return [
                              ...stripGlueFooter(lines),
                              exportedFunctions,
                              `export default new Promise(async (resolve, reject)=> { try{await __wbg_init(); resolve(${exportGenExpr})}catch(e){reject(e)}})`,
                          ];
                      })()
                    : (() => {
                          // `module` skips initSync: a module from another realm fails its instanceof check,
                          // and the byte compile it then tries is forbidden on the Next Edge runtime.
                          const initBlock =
                              strategy === "module"
                                  ? [
                                        `const __wbg_init = {}`,
                                        ...buildGlueImports(lines),
                                        `__wbg_finalize_init(new WebAssembly.Instance(${urlExpression}, __wbg_imports), ${urlExpression});`,
                                    ]
                                  : [
                                        `const __wbg_init = {}`,
                                        `initSync({module:require('fs').readFileSync(${urlExpression})});`,
                                    ];
                          return [
                              ...lines.slice(
                                  0,
                                  lines.findIndex(
                                      (item) =>
                                          !!item.match(
                                              /async function __wbg_init\(module_or_path\) {/g,
                                          )?.length,
                                  ),
                              ),
                              ...initBlock,
                              exportedFunctions,
                              `export default ${exportGenExpr}`,
                          ];
                      })();
            return `${[...(preamble ? [preamble] : []), ...body].join("\n")}`;
        },
    };

    // A build that keeps the typings puts a `.d.ts` banner on the glue. Cut it,
    // because the loader returns the glue alone.
    const generatedJs = stripTypesBanner(
        fs.readFileSync(
            path.join(
                wasmBuildSource,
                `${params.wasmName.replace(".wasm", "")}.js`,
            ),
            {
                encoding: "utf8",
            },
        ),
    );

    // With `emitTypes`, write the wasm-bindgen `<name>.d.ts` as the sidecar next to the source.
    // The returned glue does not change.
    if (params.emitTypes) {
        writeSidecar(
            params.resourcePath,
            fs.readFileSync(
                path.join(
                    wasmBuildSource,
                    `${params.wasmName.replace(".wasm", "")}.d.ts`,
                ),
                "utf8",
            ),
        );
    }

    return delivery === "import"
        ? patch.import(generatedJs)
        : patch[params.target](generatedJs);
}

// Parallel cargo builds fail on a cold shared cache, so this queue runs one build at a time.
// The lock also covers other processes, for example Turbopack workers.
let buildQueue = Promise.resolve();
module.exports = function pack(params, emitFile) {
    const guarded = () =>
        withBuildLock(params.buildFolder, () => doPack(params, emitFile));
    const run = buildQueue.then(guarded, guarded);
    buildQueue = run.then(
        () => undefined,
        () => undefined,
    );
    return run;
};
