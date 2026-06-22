import rsLib from "./lib.rs";

// In the client build `rsLib` is a Promise: the wasm is emitted as a separate
// asset and fetched at runtime. Re-exporting keeps it in the bundle so a browser
// host can await it; the build-output assertions in the test inspect the chunk.
export default rsLib;
