import rustWasmLoader from "rust-wasmpack-loader";

export default {
    input: {
        index: "src/index.js",
        "index.test": "src/index.test.js",
    },
    output: {
        dir: "dist",
        format: "esm",
        entryFileNames: "[name].js",
    },
    external: (id) => id.startsWith("node:"),
    plugins: [rustWasmLoader.rollup({ target: "node", logLevel: "info" })],
};
