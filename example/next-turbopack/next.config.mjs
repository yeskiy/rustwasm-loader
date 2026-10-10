import rustWasmLoader from "rust-wasmpack-loader";

// Next 16 builds with Turbopack by default. The helper adds `.rs` to `turbopack.rules`, and
// `output: "export"` prerenders to `out/`, which runs the Server Component wasm at build time.
export default rustWasmLoader.next({ output: "export" });
