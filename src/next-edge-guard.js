// Webpack loader that fails fast when a `.rs` module is pulled into Next.js's
// Edge graph. The Edge runtime cannot instantiate WebAssembly from inlined
// bytes, which is the delivery the Next.js helper uses for the Node and browser
// passes, so an Edge import would compile but blow up at runtime. Routing the
// Edge pass through this loader turns that into a clear build-time error, and it
// only fires when a `.rs` is actually imported into an Edge route (the rule is
// scoped to `nextRuntime === "edge"`, and the Edge pass otherwise touches no
// `.rs` files).
module.exports = function nextEdgeGuard() {
    throw new Error(
        [
            "rust-wasmpack-loader: a `.rs` module was imported into a Next.js Edge route.",
            "The Edge runtime cannot instantiate WebAssembly from inlined bytes, so this import cannot work on Edge.",
            "Move the import into a Node.js runtime route by adding `export const runtime = 'nodejs'` to the route segment.",
            "Edge `.wasm` support is a planned enhancement.",
        ].join(" "),
    );
};
