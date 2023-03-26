const path = require("path");
const fs = require("fs");
const os = require("os");
const which = require("which");

module.exports = function findWasmPack() {
    if (process.env.WASM_PACK_PATH !== undefined) {
        return process.env.WASM_PACK_PATH;
    }

    const inPath = which.sync("wasm-pack", { nothrow: true });
    if (inPath) {
        return inPath;
    }

    // TEMPORARY: This is a workaround for getting wasm-pack bin from binary-install pacakge
    const inBinaryInstallUnix = path.join(
        require.resolve("binary-install"),
        "..",
        "node_modules",
        ".bin",
        "wasm-pack"
    );

    if (fs.existsSync(inBinaryInstallUnix)) {
        return inBinaryInstallUnix;
    }
    const inBinaryInstallWin = path.join(
        require.resolve("binary-install"),
        "..",
        "node_modules",
        ".bin",
        "wasm-pack.exe"
    );
    if (fs.existsSync(inBinaryInstallWin)) {
        return inBinaryInstallWin;
    }

    const inCargo = path.join(os.homedir(), ".cargo", "bin", "wasm-pack");
    if (fs.existsSync(inCargo)) {
        return inCargo;
    }
    throw new Error("Could not find Wasm Pack");
};
