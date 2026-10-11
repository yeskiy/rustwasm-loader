const fs = require("node:fs");
const path = require("node:path");
const dtsToSidecar = require("./dtsTransform.util");

// The sidecar typings path of a `.rs` source: `<stem>.d.rs.ts` in the same directory.
const sidecarPathOf = (resourcePath) => {
    const { dir, name } = path.parse(resourcePath);
    return path.join(dir, `${name}.d.rs.ts`);
};

// Writes the sidecar typings next to the `.rs` source as `<stem>.d.rs.ts`. With
// `allowArbitraryExtensions`, TypeScript uses this file before the ambient `*.rs` declaration.
module.exports = function writeSidecar(resourcePath, wasmBindgenDts) {
    const sidecarPath = sidecarPathOf(resourcePath);
    fs.writeFileSync(sidecarPath, dtsToSidecar(wasmBindgenDts), {
        encoding: "utf8",
    });
    return sidecarPath;
};

module.exports.sidecarPathOf = sidecarPathOf;
