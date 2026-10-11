import rsLib from "./lib.rs";

// In the client build `rsLib` is a Promise that fetches the emitted wasm asset.
// The export keeps it in the bundle, which the test inspects.
export default rsLib;
