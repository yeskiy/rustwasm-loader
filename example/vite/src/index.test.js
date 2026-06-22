import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "vite";
import rustWasmLoader from "rust-wasmpack-loader";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const ssrOutDir = join(root, "dist-ssr");
const clientOutDir = join(root, "dist-client");

const plugin = () => rustWasmLoader.vite({ logLevel: "info" });

// Walk a dir tree collecting every file path (assets land in nested folders).
const listFiles = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory()
            ? listFiles(join(dir, entry.name))
            : [join(dir, entry.name)],
    );

before(async () => {
    // SSR build: the plugin must pick the `node` strategy and inline the wasm,
    // producing a module that runs under plain Node.
    await build({
        root,
        configFile: false,
        logLevel: "silent",
        plugins: [plugin()],
        build: {
            ssr: "src/index.ssr.js",
            outDir: "dist-ssr",
            emptyOutDir: true,
            rollupOptions: { output: { entryFileNames: "[name].js" } },
        },
    });

    // Client production build: the plugin must emit a separate `.wasm` asset and
    // fetch it at runtime. `assetsInlineLimit: 0` keeps it from being inlined.
    await build({
        root,
        configFile: false,
        logLevel: "silent",
        plugins: [plugin()],
        build: {
            outDir: "dist-client",
            emptyOutDir: true,
            assetsInlineLimit: 0,
            rollupOptions: {
                input: "src/index.client.js",
                output: { entryFileNames: "[name].js" },
            },
        },
    });
});

describe("vite SSR build (node strategy, inline wasm)", () => {
    test("computes fibonacci from the built module", async () => {
        const mod = await import(
            pathToFileURL(join(ssrOutDir, "index.ssr.js")).href
        );
        assert.equal(mod.default.fibonacci_bindgen, 55);
        assert.equal(mod.default.fibonacci_default, 55);
        assert.equal(mod.default.cap, "Hello");
    });
});

describe("vite client build (web strategy, emitted wasm)", () => {
    test("emits a standalone .wasm asset", () => {
        assert.ok(
            listFiles(clientOutDir).some((file) => file.endsWith(".wasm")),
            "expected a .wasm asset in the client build output",
        );
    });

    test("entry chunk fetches the emitted wasm instead of inlining bytes", () => {
        const entry = readFileSync(
            join(clientOutDir, "index.client.js"),
            "utf8",
        );
        assert.match(entry, /\.wasm/);
        assert.match(entry, /fetch\(/);
    });
});
