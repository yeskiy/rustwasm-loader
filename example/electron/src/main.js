import lib from "./lib.rs";

const NUM = 10;

// Built with the `node` strategy (electron-main), so the wasm bytes are inlined
// and this runs under plain Node as well, which the test depends on.
console.log(`fibonacci(${NUM}) = ${lib.fibonacci_bindgen(NUM)}`);

// The window bootstrap only runs inside Electron. Under plain Node
// process.versions.electron is undefined, so it stays dormant and the bundle
// still executes the inlined wasm above.
if (process.versions.electron) {
    const path = require("node:path");
    const { app, BrowserWindow } = require("electron");

    app.whenReady().then(() => {
        new BrowserWindow({ width: 800, height: 600 }).loadFile(
            path.join(__dirname, "index.html"),
        );
    });
}
