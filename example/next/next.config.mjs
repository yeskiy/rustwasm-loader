import rustWasmLoader from "rust-wasmpack-loader";

// `output: "export"` statically prerenders to `out/`, so `next build` runs the
// Server Component (and its wasm) at build time. The helper wires the loader into
// every webpack pass: node strategy for the server, web for the client.
export default rustWasmLoader.next({ output: "export" });
