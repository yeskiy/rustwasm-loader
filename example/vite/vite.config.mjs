import { defineConfig } from "vite";
import rustWasmLoader from "rust-wasmpack-loader";

// The same `.rs` import compiles to the `node` strategy for SSR and the `web`
// strategy for the client; the plugin decides per load. `npm run build` runs the
// client build below, the test drives the SSR build programmatically.
export default defineConfig({
    plugins: [rustWasmLoader.vite({ logLevel: "info" })],
    build: {
        // Keep the emitted .wasm as a separate asset so the client build exercises
        // the fetch path instead of inlining the bytes.
        assetsInlineLimit: 0,
        rollupOptions: {
            input: "src/index.client.js",
            output: { entryFileNames: "[name].js" },
        },
    },
});
