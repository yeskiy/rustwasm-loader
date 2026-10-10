const fs = require("node:fs");
const path = require("node:path");
const dtsToSidecar = require("./dtsTransform.util");

// Writes the sidecar typings next to the `.rs` source as `<stem>.d.rs.ts`. With
// `allowArbitraryExtensions`, TypeScript uses this file before the ambient `*.rs` declaration.
module.exports = function writeSidecar(resourcePath, wasmBindgenDts) {
    const { dir, name } = path.parse(resourcePath);
    const sidecarPath = path.join(dir, `${name}.d.rs.ts`);
    fs.writeFileSync(sidecarPath, dtsToSidecar(wasmBindgenDts), {
        encoding: "utf8",
    });
    return sidecarPath;
};
