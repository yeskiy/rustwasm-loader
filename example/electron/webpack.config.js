const path = require("node:path");
const HtmlWebpackPlugin = require("html-webpack-plugin");

// One config per Electron process. The loader maps `electron-main` to `node` and
// `electron-renderer` to `web`, and both inline the wasm bytes.
const base = (name, filename) => ({
    name,
    mode: "development",
    target: `electron-${name}`,
    entry: `./src/${filename}`,
    output: {
        path: path.resolve(__dirname, "dist"),
        filename,
    },
    module: {
        rules: [
            {
                test: /\.rs$/,
                exclude: /node_modules/,
                use: {
                    loader: "rust-wasmpack-loader",
                    options: { node: { bundle: true }, logLevel: "info" },
                },
            },
        ],
    },
});

module.exports = [
    base("main", "main.js"),
    {
        ...base("renderer", "renderer.js"),
        plugins: [new HtmlWebpackPlugin({ template: "./src/index.html" })],
    },
];
