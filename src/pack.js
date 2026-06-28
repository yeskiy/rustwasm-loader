const path = require("node:path");
const fs = require("node:fs");
const findNearestCargoBy = require("./utils/findNearestCargo.util");
const spawnWasmPack = require("./utils/spawnWasmPack.util");
const writeSidecar = require("./utils/writeSidecar.util");

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

/** @typedef {Object} ImportOptions
 * @property {string} urlExpression - JS expression the chosen strategy consumes: the runtime wasm URL for `fetch`/`fs`, or a pre-compiled `WebAssembly.Module` binding for `module`
 * @property {"fetch" | "fs" | "module"} strategy - how the wasm is consumed (fetch for web, fs for node/SSR, module for an already-compiled module on Edge)
 * @property {string} [preamble] - source prepended to the module (e.g. a `import url from "./x.wasm?url"` line)
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
 * @property {ImportOptions} [import] - opt-in import-based wasm delivery (host bundler supplies the URL)
 * @property {boolean} [emitTypes] - also write the `<name>.d.rs.ts` sidecar from this build (keeps wasm-bindgen typings instead of `--no-typescript`)
 * */

// Shared default-export body: spreads the named Rust exports over any remaining
// `wasm` bindings. Identical across every delivery so the module shape matches.
const exportGenExpr = `{...exportedFunctions, ...Object.entries(wasm).filter(([item]) => Object.keys(exportedFunctions).indexOf(item) === -1).reduce((acc, item) => ({...acc,[item[0]]: item[1]}), {})}`;

// Resolves the explicit wasm-delivery strategy from the loader params. The three
// legacy values (fetch / inline / fsread) preserve the original target+option
// branching exactly; `import` is opt-in and only chosen when `params.import` is set.
function selectDelivery(params) {
    if (params.import) {
        return "import";
    }
    if (params.target === "web") {
        return params.web.asyncLoading ? "fetch" : "inline";
    }
    return params.node.bundle ? "inline" : "fsread";
}

// Deliveries that emit the .wasm as a standalone asset (the host reads it at
// runtime). inline/import keep everything in the JS, so they emit nothing.
const assetEmittingDeliveries = new Set(["fetch", "fsread"]);

/**
 * pack function
 * @param {Options} params
 * emitFile - function to emit file
 * */

async function doPack(params, emitFile) {
    // Get  dir from resources
    const { dir } = path.parse(path.normalize(params.resourcePath));

    // Set wasm build folder
    const wasmBuildSource = path.join(params.buildFolder, "pkg");

    // Pick the explicit delivery strategy up front so the emit decision and the
    // post-processing branch read from one source of truth.
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
        // Keep wasm-bindgen's `.d.ts` only when the sidecar is requested; otherwise
        // the build drops it.
        typescript: !!params.emitTypes,
        args: [...logLevelSelector(params.logLevel)],
        // use `web` target because the generated file of this target modifies easily
        extraArgs: ["--target", "web"],
    });

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

        // Import-based delivery: the host bundler resolves the .wasm itself and
        // hands us either its URL (fetch/fs) or an already-compiled module
        // (module). We strip the wasm-pack bootstrap like the other modes and
        // init from `params.import.urlExpression`.
        import: (generatedJs) => {
            const { urlExpression, strategy, preamble } = params.import;
            const lines = generatedJs.replaceAll("_bg.wasm", "").split("\n");
            const exportedFunctions = `const exportedFunctions = {${lines
                .filter(
                    (item) => !!item.match(/export function .+ {$/g)?.length,
                )
                .map((item) => item.split("function")[1].split("(")[0])
                .map((item) => `${item}:${item}`)
                .join(",")}};`;
            // `fetch` reuses wasm-bindgen's own loader: it swaps the default
            // `import.meta.url` URL for the host asset URL, then awaits __wbg_init()
            // so the wasm is fetched at runtime (Promise default export). The sync
            // strategies strip the bootstrap and init in place from the kept glue
            // helpers (__wbg_get_imports / __wbg_init_memory / __wbg_finalize_init).
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
                              ...lines.slice(
                                  0,
                                  lines.findIndex(
                                      (item) =>
                                          !!item.match(/export { initSync }/g)
                                              ?.length,
                                  ),
                              ),
                              exportedFunctions,
                              `export default new Promise(async (resolve, reject)=> { try{await __wbg_init(); resolve(${exportGenExpr})}catch(e){reject(e)}})`,
                          ];
                      })()
                    : (() => {
                          // `fs` reads the URL off disk into bytes and lets initSync
                          // compile them (node only). `module` is handed an
                          // already-compiled WebAssembly.Module and instantiates it
                          // directly: initSync guards on `module instanceof
                          // WebAssembly.Module`, which is false for a module the Next
                          // Edge sandbox compiled in the host realm, so it would fall
                          // back to a byte compile the Edge runtime forbids.
                          // `new WebAssembly.Instance(module, imports)` accepts the
                          // cross-realm module and never compiles bytes.
                          const initBlock =
                              strategy === "module"
                                  ? [
                                        `const __wbg_init = {}`,
                                        `const __wbg_imports = __wbg_get_imports();`,
                                        `__wbg_init_memory(__wbg_imports);`,
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

    // Typings reuse this build: wasm-bindgen also emitted `<name>.d.ts` (the
    // companion to the glue `.js` above) when `emitTypes` is set, so transform it
    // into the sidecar next to the source. The glue returned below is identical
    // whether or not this runs.
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

// wasm-pack shells out to cargo, so running several builds at once contends on
// the shared cargo cache. A cold cache (CI) makes this fail outright when a
// parallel webpack MultiCompiler builds the same `.rs` for two targets at once.
// Serialize the builds; the per-source temp dirs already isolate their output.
let buildQueue = Promise.resolve();
module.exports = function pack(params, emitFile) {
    const run = buildQueue.then(
        () => doPack(params, emitFile),
        () => doPack(params, emitFile),
    );
    buildQueue = run.then(
        () => undefined,
        () => undefined,
    );
    return run;
};
