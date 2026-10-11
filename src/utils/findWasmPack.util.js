const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const which = require("which");

// Some wasm-pack npm releases ship the executable through `binary-install`.
// When that package does not resolve, the search continues with the next candidate.
function binaryInstallCandidate() {
    try {
        return path.join(
            require.resolve("binary-install"),
            "..",
            "node_modules",
            ".bin",
            "wasm-pack.exe",
        );
    } catch {
        return undefined;
    }
}

module.exports = function findWasmPack() {
    if (process.env.WASM_PACK_PATH !== undefined) {
        return process.env.WASM_PACK_PATH;
    }

    const inPath = which.sync("wasm-pack", { nothrow: true });
    if (inPath) {
        return inPath;
    }

    const inBinaryInstallWin = binaryInstallCandidate();
    if (inBinaryInstallWin && fs.existsSync(inBinaryInstallWin)) {
        return inBinaryInstallWin;
    }

    const inCargo = path.join(os.homedir(), ".cargo", "bin", "wasm-pack");
    if (fs.existsSync(inCargo)) {
        return inCargo;
    }
    throw new Error(
        "Could not find wasm-pack. Install wasm-pack, or set WASM_PACK_PATH to its executable.",
    );
};
