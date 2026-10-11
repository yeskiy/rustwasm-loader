import rustWasmLoader from "rust-wasmpack-loader";

// The helper uses `node` for the server, `web` for the client, and the `module`
// delivery for Edge. The `/` page runs its wasm at build time, `/edge` runs it on Edge.
export default rustWasmLoader.next({});
