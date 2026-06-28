const path = require("node:path");

module.exports = {
    mode: "production",
    target: "node",
    entry: "./src/index.ts",
    output: {
        path: path.resolve(__dirname, "dist"),
        filename: "bundle.js",
        library: { type: "commonjs2" },
        clean: true,
    },
    resolve: {
        extensions: [".ts", ".js"],
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                exclude: /node_modules/,
                use: {
                    loader: "babel-loader",
                    options: {
                        presets: [
                            [
                                "@babel/preset-env",
                                {
                                    targets: { node: "current" },
                                    modules: false,
                                },
                            ],
                            "@babel/preset-typescript",
                        ],
                    },
                },
            },
            {
                test: /\.rs$/,
                exclude: /node_modules/,
                use: {
                    loader: "rust-wasmpack-loader",
                    options: {
                        target: "node",
                        node: { bundle: true },
                        logLevel: "error",
                    },
                },
            },
        ],
    },
    optimization: {
        minimize: false,
    },
};
