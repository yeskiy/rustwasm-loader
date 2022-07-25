const path = require("path");
const nodeExternals = require("webpack-node-externals");
const NodemonPlugin = require("nodemon-webpack-plugin");

module.exports = {
    mode: "development",
    entry: ["regenerator-runtime/runtime", "./src/index.js"],
    output: {
        path: path.resolve(__dirname, "dist"),
        filename: "bundle.js",
        clean: true,
    },
    target: "async-node",
    node: false,
    externals: nodeExternals(),
    module: {
        rules: [
            {
                test: /\.js$/,
                exclude: /node_modules/,
                resolve: {
                    fullySpecified: false,
                },
                use: {
                    loader: "babel-loader",
                    options: {
                        presets: ["@babel/preset-env"],
                        plugins: ["@babel/plugin-syntax-async-generators"],
                    },
                },
            },

            {
                test: /\.rs$/,
                exclude: /node_modules/,
                use: [
                    {
                        loader: "babel-loader",
                        options: {
                            presets: ["@babel/preset-env"],
                            plugins: ["@babel/plugin-syntax-async-generators"],
                        },
                    },
                    {
                        loader: "rust-wasmpack-loader",
                    },
                ],
            },
        ],
    },
    resolve: {
        extensions: [".js", ".ts"],
    },
    plugins: [
        new NodemonPlugin({
            script: path.resolve("./dist/bundle.js"),
            watch: [path.resolve("./dist")],
            ignore: [
                "*.js.map",
                "./src/**/*.js",
                "./src/**/*.ts",
                "swagger.json",
            ],
        }),
    ],

    experiments: {
        syncWebAssembly: true,
    },
};
