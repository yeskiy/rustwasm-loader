const path = require("node:path");
const fs = require("node:fs");
const {
    findNearestCargo,
    writeCargoFiles,
} = require("./utils/findNearestCargo.util");
const buildCrate = require("./utils/cargoBuild.util");
const writeSidecar = require("./utils/writeSidecar.util");
const stripGlueFooter = require("./utils/stripGlueFooter.util");
const stripTypesBanner = require("./utils/stripTypesBanner.util");
const buildGlueImports = require("./utils/buildGlueImports.util");
const buildExportedBindings = require("./utils/buildExportedBindings.util");
const buildWasmUrl = require("./utils/buildWasmUrl.util");
const withBuildLock = require("./utils/buildLock.util");

const toArrayBuffer = `function toArrayBuffer(buffer) {\n    const ab = new ArrayBuffer(buffer.length);\n    const view = new Uint8Array(ab);\n    for (var i = 0; i < buffer.length; ++i) {\n        view[i] = buffer[i];\n    }\n    return ab;\n}`;

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

// The default-export body of the deliveries that start the wasm with the wasm-bindgen `__wbg_init`.
const asyncExportExpr = `new Promise(async (resolve, reject)=> { try{await __wbg_init(); resolve(${exportGenExpr})}catch(e){reject(e)}})`;

const INIT_LINE = /async function __wbg_init\(module_or_path\) {/;
const URL_LINE = /import.meta.url/;

// Keeps the glue lines before the wasm-bindgen bootstrap.
const cutAtInit = (lines) =>
    lines.slice(
        0,
        lines.findIndex((line) => INIT_LINE.test(line)),
    );

// Returns the glue lines with the first `import.meta.url` line replaced by the given wasm location.
const replaceUrlLine = (lines, expression) => {
    const urlIndex = lines.findIndex((line) => URL_LINE.test(line));
    return lines.map((line, index) =>
        index === urlIndex ? `        module_or_path = ${expression};` : line,
    );
};

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
    const wasmBuildSource = path.join(params.buildFolder, "pkg");
    const wasmPath = path.join(wasmBuildSource, params.wasmName);
    const wasmStem = params.wasmName.replace(".wasm", "");
    const delivery = selectDelivery(params);

    writeCargoFiles(
        params.buildFolder,
        findNearestCargo(
            path.parse(path.normalize(params.resourcePath)).dir,
            path.normalize(params.baseFolder),
            path.normalize(params.resourcePath),
            params.buildFolder,
        ),
    );

    // The build also records the module files that cargo compiled, for the next digest and watch list.
    await buildCrate({
        resourcePath: params.resourcePath,
        baseFolder: params.baseFolder,
        buildFolder: params.buildFolder,
        wasmPack: {
            outDir: wasmBuildSource,
            outName: params.wasmName,
            // Keep the wasm-bindgen `.d.ts` only when the typings sidecar is requested.
            typescript: !!params.emitTypes,
            args: logLevelSelector(params.logLevel),
            // use `web` target because the generated file of this target modifies easily
            extraArgs: ["--target", "web"],
        },
    });

    if (assetEmittingDeliveries.has(delivery)) {
        emitFile(params.wasmName, fs.readFileSync(wasmPath));
    }

    // The wasm bytes as an `ArrayBuffer` expression for the inline deliveries.
    const inlineBytes = () =>
        `toArrayBuffer(${JSON.stringify(fs.readFileSync(wasmPath).toJSON().data)})`;

    // update generated .js script by wasm to remove bad imports and resolve native rs functions without __wasm ident
    const patch = {
        node: (generatedJs) => {
            const lines = generatedJs.split("\n");
            return [
                ...cutAtInit(lines),
                `const __wbg_init = {}`,
                `initSync(${
                    params.node.bundle
                        ? `{module:${inlineBytes()}}`
                        : `{module:require('fs').readFileSync(require('path').join(__dirname, '${params.wasmName}'))}`
                });`,
                buildExportedBindings(lines),
                ...(params.node.bundle ? [toArrayBuffer] : []),
                `export default ${exportGenExpr}`,
            ].join("\n");
        },

        web: (generatedJs) => {
            const lines = replaceUrlLine(
                generatedJs.replaceAll("_bg.wasm", "").split("\n"),
                JSON.stringify(
                    buildWasmUrl(
                        params.web.wasmPathModifier,
                        params.web.publicPath,
                        params.wasmName,
                    ),
                ),
            );
            // Async loading keeps the wasm-bindgen `__wbg_init` and drops only the export footer.
            // Inline mode cuts at the bootstrap, because it gives the bytes to `initSync`.
            return [
                ...(params.web.asyncLoading
                    ? stripGlueFooter(lines)
                    : cutAtInit(lines)),
                toArrayBuffer,
                ...(params.web.asyncLoading
                    ? []
                    : [`const __wbg_init = {}`, `initSync(${inlineBytes()});`]),
                buildExportedBindings(lines),
                `export default ${
                    params.web.asyncLoading ? asyncExportExpr : exportGenExpr
                }`,
            ].join("\n");
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
                    ? [
                          ...stripGlueFooter(
                              replaceUrlLine(lines, urlExpression),
                          ),
                          exportedFunctions,
                          `export default ${asyncExportExpr}`,
                      ]
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
                              ...cutAtInit(lines),
                              ...initBlock,
                              exportedFunctions,
                              `export default ${exportGenExpr}`,
                          ];
                      })();
            return [...(preamble ? [preamble] : []), ...body].join("\n");
        },
    };

    // A build that keeps the typings puts a `.d.ts` banner on the glue. Cut it,
    // because the loader returns the glue alone.
    const generatedJs = stripTypesBanner(
        fs.readFileSync(path.join(wasmBuildSource, `${wasmStem}.js`), "utf8"),
    );

    // With `emitTypes`, write the wasm-bindgen `<name>.d.ts` as the sidecar next to the source.
    // The returned glue does not change.
    if (params.emitTypes) {
        writeSidecar(
            params.resourcePath,
            fs.readFileSync(
                path.join(wasmBuildSource, `${wasmStem}.d.ts`),
                "utf8",
            ),
        );
    }

    return delivery === "import"
        ? patch.import(generatedJs)
        : patch[params.target](generatedJs);
}

// This queue runs one build at a time. The build-folder lock comes first, then the lock
// of the shared cargo target folder, and both also cover other processes.
const buildQueue = { tail: Promise.resolve() };
module.exports = function pack(params, emitFile) {
    const guarded = () =>
        withBuildLock(params.buildFolder, () => doPack(params, emitFile));
    const run = buildQueue.tail.then(guarded, guarded);
    buildQueue.tail = run.then(
        () => undefined,
        () => undefined,
    );
    return run;
};
module.exports.logLevelSelector = logLevelSelector;
