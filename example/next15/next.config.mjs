import rustWasmLoader from "rust-wasmpack-loader";

// Next.js 15 builds with webpack by default and takes `next build --turbopack`
// from 15.3 on. The helper writes the Turbopack block under the key this release
// reads (top-level `turbopack` from 15.3, `experimental.turbo` before that) and
// in the rule shape it accepts (a map keyed by condition up to 15.5), so the same
// wrapped config builds under either bundler.
export default rustWasmLoader.next({});
