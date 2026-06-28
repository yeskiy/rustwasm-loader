---
sidebar_position: 9
---

# Electron example

This example shows how to use rust-wasmpack-loader in an [Electron](https://www.electronjs.org/) app built with
Webpack. The same `.rs` file is imported from both Electron processes: the main process and the renderer.

Webpack's `target` is set per config, so an Electron app needs two configs. The loader maps each Electron target onto a
strategy it already supports:

- `electron-main` and `electron-preload` use the `node` strategy.
- `electron-renderer` uses the `web` strategy.

Both inline the compiled WebAssembly as bytes into the generated JavaScript, so there is no separate `.wasm` asset to
ship with the app.

## Project structure

```
electron-example/
├── src/
│   ├── main.js          # Main process: imports the .rs module, opens a window
│   ├── renderer.js      # Renderer: imports the same .rs module, updates the page
│   ├── index.html       # Renderer page
│   ├── index.test.js    # Build-and-inspect test (node:test)
│   └── lib.rs           # Rust WebAssembly code
├── dist/                # Build output (main.js, renderer.js, index.html)
├── webpack.config.js    # Array of two configs: main and renderer
├── Cargo.toml           # Rust configuration
└── package.json         # Dependencies and scripts
```

## Setup

### 1. Initialize the project

```bash
mkdir my-electron-wasm-app
cd my-electron-wasm-app
npm init -y
```

### 2. Install dependencies

```bash
npm install --save-dev rust-wasmpack-loader webpack webpack-cli html-webpack-plugin electron
```

### 3. Create Cargo.toml

```toml title="Cargo.toml"
[package]
name = "electron-wasm-example"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
wasm-bindgen = "0.2.95"
```

### 4. Create the Rust code

```rust title="src/lib.rs"
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn fibonacci_bindgen(n: i32) -> i32 {
    match n {
        0 => 0,
        1 => 1,
        _ => fibonacci_bindgen(n - 1) + fibonacci_bindgen(n - 2),
    }
}
```

### 5. Configure Webpack

Export an array of two configs. Both reuse the same loader rule; the renderer adds `html-webpack-plugin` to generate its
page.

```javascript title="webpack.config.js"
const path = require("node:path");
const HtmlWebpackPlugin = require("html-webpack-plugin");

const rsRule = () => ({
    test: /\.rs$/,
    exclude: /node_modules/,
    use: {
        loader: "rust-wasmpack-loader",
        options: { node: { bundle: true }, logLevel: "info" },
    },
});

const mainConfig = {
    name: "main",
    mode: "development",
    target: "electron-main",
    entry: "./src/main.js",
    output: { path: path.resolve(__dirname, "dist"), filename: "main.js" },
    module: { rules: [rsRule()] },
    resolve: { extensions: [".js", ".rs"] },
};

const rendererConfig = {
    name: "renderer",
    mode: "development",
    target: "electron-renderer",
    entry: "./src/renderer.js",
    output: { path: path.resolve(__dirname, "dist"), filename: "renderer.js" },
    module: { rules: [rsRule()] },
    resolve: { extensions: [".js", ".rs"] },
    plugins: [new HtmlWebpackPlugin({ template: "./src/index.html" })],
};

module.exports = [mainConfig, rendererConfig];
```

`node.bundle` inlines the wasm bytes for the main process. The renderer inlines by default, so it needs no extra option.

### 6. Create the main process

The main process imports the `.rs` module and calls it directly. The window bootstrap is guarded by
`process.versions.electron` so the same bundle also runs under plain Node, which the test uses.

```javascript title="src/main.js"
import lib from "./lib.rs";

console.log(`fibonacci(10) = ${lib.fibonacci_bindgen(10)}`);

if (process.versions.electron) {
    const path = require("node:path");
    const { app, BrowserWindow } = require("electron");

    app.whenReady().then(() => {
        new BrowserWindow({ width: 800, height: 600 }).loadFile(
            path.join(__dirname, "index.html"),
        );
    });
}
```

### 7. Create the renderer

```javascript title="src/renderer.js"
import lib from "./lib.rs";

const result = lib.fibonacci_bindgen(10);

const output = document.getElementById("result");
if (output) {
    output.textContent = `fibonacci(10) = ${result}`;
}
```

### 8. Create the renderer page

The renderer instantiates WebAssembly from inlined bytes, so its Content-Security-Policy needs `'wasm-unsafe-eval'` in
`script-src`.

```html title="src/index.html"
<!doctype html>
<html lang="en">
    <head>
        <meta charset="utf-8" />
        <meta
            http-equiv="Content-Security-Policy"
            content="default-src 'self'; script-src 'self' 'wasm-unsafe-eval'"
        />
        <title>rust-wasmpack-loader in Electron</title>
    </head>
    <body>
        <p id="result">Computing...</p>
    </body>
</html>
```

### 9. Update package.json

```json title="package.json"
{
    ...,
    "scripts": {
        "build": "webpack --config webpack.config.js",
        "start": "webpack --config webpack.config.js && electron dist/main.js"
    },
    ...
}
```

## Running the example

```bash
# Build both processes
npm run build

# Build and launch the app
npm start
```

---

:::note Testing without a display
Launching Electron needs a display, so the example test does not start the app. It runs the Webpack build for both
configs, runs the built main bundle under Node to confirm the inlined wasm computes `fibonacci(10) = 55`, and checks that
the renderer bundle inlines the module. The build and test never need the Electron binary itself, so CI installs the
example with `ELECTRON_SKIP_BINARY_DOWNLOAD=1`. Running the actual desktop app needs a normal install to fetch the binary.
:::
