/* Referenced From: https://github.com/wasm-tool/wasm-pack-plugin/blob/64c2840db0cccd77d0af26813176e55ed38cff69/plugin.js */
const { spawn } = require("child_process");

module.exports = async function runProcess(bin, args, options) {
    return new Promise((resolve, reject) => {
        const p = spawn(bin, args, {
            ...options,
            shell: process.platform === "win32",
        });

        p.on("close", (code) => {
            if (code === 0) {
                setTimeout(resolve, 100);
            } else {
                reject(new Error("Rust compilation error."));
            }
        });

        p.on("error", reject);
    });
};
