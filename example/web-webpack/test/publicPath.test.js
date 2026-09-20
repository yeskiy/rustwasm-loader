const fs = require("node:fs");
const path = require("node:path");

const DIST = path.resolve(__dirname, "..", "dist");

// The webpack `eval` devtool escapes the quotes of the patched glue line.
const wasmUrlOf = (bundle) =>
    /module_or_path = \\?"([^"\\]+)\\?"/.exec(
        fs.readFileSync(path.join(DIST, bundle), "utf8"),
    )?.[1];

describe("emitted wasm URL", () => {
    test("the default public path keeps the asset at the server root", () => {
        expect(wasmUrlOf("comp.test.js")).toMatch(/^\/[^/]+\.module\.wasm$/);
    });

    test("an explicit public path prefixes the asset URL", () => {
        expect(wasmUrlOf("comp.assets.test.js")).toMatch(
            /^\/assets\/[^/]+\.module\.wasm$/,
        );
    });

    test("an absolute public path keeps its scheme and host", () => {
        expect(wasmUrlOf("cdn.bundle.js")).toMatch(
            /^https:\/\/cdn\.example\.com\/[^/]+\.module\.wasm$/,
        );
    });
});
