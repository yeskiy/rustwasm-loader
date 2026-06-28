const { test, describe, before } = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const webpack = require("webpack");
const configs = require("../webpack.config");

const distDir = path.resolve(__dirname, "..", "dist");

describe("electron", () => {
    before(
        () =>
            new Promise((resolve, reject) => {
                // Builds both configs (electron-main and electron-renderer). A
                // successful build proves the loader accepts the Electron targets.
                webpack(configs, (err, stats) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    if (stats.hasErrors()) {
                        reject(new Error(stats.toString({ errors: true })));
                        return;
                    }
                    resolve();
                });
            }),
        { timeout: 600000 },
    );

    test("builds the main and renderer bundles", () => {
        assert.ok(fs.existsSync(path.join(distDir, "main.js")));
        assert.ok(fs.existsSync(path.join(distDir, "renderer.js")));
    });

    test("electron-main bundle runs the inlined wasm under node", () => {
        // The process.versions.electron guard keeps the BrowserWindow code from
        // running, so plain Node executes only the inlined wasm path.
        assert.match(
            execFileSync(process.execPath, [path.join(distDir, "main.js")], {
                encoding: "utf8",
            }),
            /fibonacci\(10\) = 55/,
        );
    });

    test("electron-renderer bundle inlines the wasm", () => {
        const bundle = fs.readFileSync(
            path.join(distDir, "renderer.js"),
            "utf8",
        );
        assert.match(bundle, /toArrayBuffer/);
        assert.match(bundle, /fibonacci/);
    });
});
