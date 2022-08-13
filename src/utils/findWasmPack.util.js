/* Referenced From: https://github.com/wasm-tool/wasm-pack-plugin/blob/64c2840db0cccd77d0af26813176e55ed38cff69/plugin.js */
const path = require("path");
const fs = require("fs");
const os = require("os");
const which = require("which");

module.exports = function findWasmPack() {
    // https://github.com/wasm-tool/wasm-pack-plugin/issues/58
    if (process.env.WASM_PACK_PATH !== undefined) {
        return process.env.WASM_PACK_PATH;
    }

    const inPath = which.sync("wasm-pack", { nothrow: true });
    if (inPath) {
        return inPath;
    }

    const inCargo = path.join(os.homedir(), ".cargo", "bin", "wasm-pack");
    if (fs.existsSync(inCargo)) {
        return inCargo;
    }
    throw new Error("Could not find Wasm Pack");
};
