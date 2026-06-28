import rustWasmLoader from "rust-wasmpack-loader";

// The helper wires the loader into every webpack/Turbopack pass: the node
// strategy for the server, web for the client, and the `module` delivery for the
// Edge runtime. The `/` page is a Server Component that runs its wasm at build
// time (static prerender); `/api/edge` exercises the same `.rs` on Edge.
export default rustWasmLoader.next({});
