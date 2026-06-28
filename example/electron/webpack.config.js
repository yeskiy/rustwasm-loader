const path = require("node:path");
const HtmlWebpackPlugin = require("html-webpack-plugin");

// webpack's `target` is per-config, so an Electron app needs one config per
// process. The loader maps `electron-main` to the `node` strategy and
// `electron-renderer` to `web`; `node.bundle` inlines the wasm bytes for the
// main process, and the renderer inlines by default.
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
    output: {
        path: path.resolve(__dirname, "dist"),
        filename: "main.js",
    },
    module: { rules: [rsRule()] },
    resolve: { extensions: [".js", ".rs"] },
};

const rendererConfig = {
    name: "renderer",
    mode: "development",
    target: "electron-renderer",
    entry: "./src/renderer.js",
    output: {
        path: path.resolve(__dirname, "dist"),
        filename: "renderer.js",
    },
    module: { rules: [rsRule()] },
    resolve: { extensions: [".js", ".rs"] },
    plugins: [new HtmlWebpackPlugin({ template: "./src/index.html" })],
};

module.exports = [mainConfig, rendererConfig];
