const fs = require("node:fs");
const path = require("node:path");
const dtsToSidecar = require("./dtsTransform.util");

/**
 * Transforms a wasm-bindgen `.d.ts` into the loader's sidecar shape and writes it
 * next to the `.rs` source as `<stem>.d.rs.ts` (the name TS resolves under
 * `allowArbitraryExtensions`, overriding the ambient `*.rs` floor for this file).
 * @param {string} resourcePath absolute path to the `.rs` file
 * @param {string} wasmBindgenDts wasm-bindgen `.d.ts` source
 * @returns {string} the written sidecar path
 */
module.exports = function writeSidecar(resourcePath, wasmBindgenDts) {
    const { dir, name } = path.parse(resourcePath);
    const sidecarPath = path.join(dir, `${name}.d.rs.ts`);
    fs.writeFileSync(sidecarPath, dtsToSidecar(wasmBindgenDts), {
        encoding: "utf8",
    });
    return sidecarPath;
};
