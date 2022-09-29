const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");

module.exports = {
    mode: "development",
    entry: "./src/index.js",
    output: {
        path: path.resolve(__dirname, "dist"),
        filename: "bundle.js",
        clean: true,
    },
    devServer: {
        historyApiFallback: true,
        hot: true,
        open: false,
        port: 9191,
    },
    module: {
        rules: [
            {
                test: /\.rs$/,
                exclude: /node_modules/,
                use: {
                    loader: "rust-wasmpack-loader",
                },
            },
        ],
    },
    resolve: {
        extensions: [".js", ".ts"],
    },
    plugins: [new HtmlWebpackPlugin()],
};
