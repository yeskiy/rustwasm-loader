import lib from "./lib.rs";

const NUM = 10;

// Built with the `node` strategy (electron-main), so the wasm bytes are inlined
// and this runs under plain Node as well, which the test depends on.
console.log(`fibonacci(${NUM}) = ${lib.fibonacci_bindgen(NUM)}`);

// The window opens only inside Electron. Under plain Node the bundle runs the
// inlined wasm above and skips this block.
if (process.versions.electron) {
    const path = require("node:path");
    const { app, BrowserWindow } = require("electron");

    app.whenReady().then(() => {
        new BrowserWindow({ width: 800, height: 600 }).loadFile(
            path.join(__dirname, "index.html"),
        );
    });
}
