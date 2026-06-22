import * as esbuild from "esbuild";
import rustWasmLoader from "rust-wasmpack-loader";

await esbuild.build({
    entryPoints: ["src/index.js", "src/index.test.js"],
    bundle: true,
    format: "esm",
    platform: "node",
    outdir: "dist",
    logLevel: "info",
    plugins: [rustWasmLoader.esbuild({ logLevel: "info" })],
});
