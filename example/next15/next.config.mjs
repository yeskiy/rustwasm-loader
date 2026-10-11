import rustWasmLoader from "rust-wasmpack-loader";

// The helper writes the Turbopack block in the key and rule shape that this Next.js 15
// release reads, so the same config builds under webpack and under `--turbopack`.
export default rustWasmLoader.next({});
