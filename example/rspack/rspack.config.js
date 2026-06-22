const path = require("node:path");
const nodeExternals = require("webpack-node-externals");

module.exports = {
    mode: "development",
    entry: "./src/index.js",
    output: {
        path: path.resolve(__dirname, "dist"),
        filename: "bundle.js",
        clean: true,
    },
    target: "node",
    node: false,
    externals: nodeExternals(),
    module: {
        rules: [
            {
                test: /\.rs$/,
                exclude: /node_modules/,
                use: [
                    {
                        loader: "rust-wasmpack-loader",
                        options: {
                            node: {
                                bundle: true,
                            },
                            logLevel: "info",
                        },
                    },
                ],
            },
        ],
    },
    resolve: {
        extensions: [".js", ".ts"],
    },
    experiments: {
        syncWebAssembly: true,
        asyncWebAssembly: false,
    },
};
