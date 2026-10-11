import { defineConfig } from "vite";
import rustWasmLoader from "rust-wasmpack-loader";

// The plugin uses `node` for SSR and `web` for the client. `npm run build` runs
// the client build below, and the test runs the SSR build.
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
