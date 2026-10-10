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

// The variants share one output folder, so none cleans it. The test script builds
// them one at a time, because parallel compilers share the `.rs` build folder.
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

// Jest runs only `comp*.test.js` bundles. The test server cannot answer for the
// absolute public path, so the test reads only the emitted URL of that bundle.
module.exports = [
    variant("default-public-path", "comp.test.js"),
    variant("explicit-public-path", "comp.assets.test.js", "/assets/"),
    variant(
        "absolute-public-path",
        "cdn.bundle.js",
        "https://cdn.example.com/",
    ),
];
