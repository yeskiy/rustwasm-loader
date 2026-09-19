const common = require("./webpack.config");

const rsRule = {
    test: /\.rs$/,
    exclude: /node_modules/,
    use: {
        loader: "rust-wasmpack-loader",
        options: {
            web: {
                asyncLoading: true,
            },
        },
    },
};

// Both variants write into one folder, so neither may clean it. The test script
// builds them one after the other with `--config-name`, because two compilers of
// one webpack process share the build folder of the same `.rs` source.
const variant = (name, filename, publicPath) => ({
    ...common,
    name,
    entry: "./src/index.test.js",
    output: {
        ...common.output,
        filename,
        clean: false,
        ...(publicPath ? { publicPath } : {}),
    },
    plugins: [],
    module: { rules: [rsRule] },
});

module.exports = [
    variant("default-public-path", "comp.test.js"),
    variant("explicit-public-path", "comp.assets.test.js", "/assets/"),
];
