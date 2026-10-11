/* Referenced From: https://github.com/wasm-tool/wasm-pack-plugin/blob/64c2840db0cccd77d0af26813176e55ed38cff69/plugin.js */
const runProcess = require("./runProcess.util");
const findWasmPack = require("./findWasmPack.util");

module.exports = function spawnWasmPack({
    outDir,
    outName,
    isDebug,
    cwd,
    targetDir,
    typescript = false,
    args = [],
    extraArgs = [],
}) {
    return runProcess(
        findWasmPack(),
        [
            ...args,
            "build",
            "--out-dir",
            outDir,
            "--out-name",
            outName,
            ...(isDebug ? ["--dev"] : []),
            ...(typescript ? [] : ["--no-typescript"]),
            ...extraArgs,
        ],
        {
            cwd,
            stdio: "inherit",
            ...(targetDir && {
                env: { ...process.env, CARGO_TARGET_DIR: targetDir },
            }),
        },
    );
};
