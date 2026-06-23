import rustWasmLoader from "rust-wasmpack-loader";

// `next build` defaults to Turbopack in Next 16, so this example builds under
// Turbopack (no `--webpack`). The helper wires `.rs` into `turbopack.rules`: the
// node strategy for the server, web for the client, bytes inlined in both.
// `output: "export"` statically prerenders to `out/`, running the Server
// Component's wasm at build time.
export default rustWasmLoader.next({ output: "export" });
