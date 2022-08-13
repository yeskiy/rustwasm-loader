/* Referenced From: https://github.com/wasm-tool/wasm-pack-plugin/blob/64c2840db0cccd77d0af26813176e55ed38cff69/plugin.js */
const { spawn } = require("child_process");

module.exports = async function runProcess(bin, args, options) {
    return new Promise((resolve, reject) => {
        const p = spawn(bin, args, options);

        p.on("close", (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error("Rust compilation."));
            }
        });

        p.on("error", reject);
    });
};
