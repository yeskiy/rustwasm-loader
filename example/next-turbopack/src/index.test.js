import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const rustWasmLoader = require("rust-wasmpack-loader");

const root = dirname(dirname(fileURLToPath(import.meta.url)));

// The helper builds both keys; this reads the Turbopack rules it produced.
const turbopackRules = rustWasmLoader.next({}, {}).turbopack.rules["*.rs"];
const ruleFor = (conditionPredicate) => turbopackRules.find(conditionPredicate);

describe("withRustWasm helper (turbopack.rules)", () => {
    test("server (non-browser) rule uses the loader with the node target", () => {
        const rule = ruleFor(
            (r) =>
                typeof r.condition === "object" &&
                r.condition.not === "browser",
        );
        assert.equal(rule.as, "*.js");
        assert.match(rule.loaders[0].loader, /index\.js$/);
        assert.equal(rule.loaders[0].options.target, "node");
        assert.equal(rule.loaders[0].options.node.bundle, true);
    });

    test("client (browser) rule uses the loader with the web target", () => {
        const rule = ruleFor((r) => r.condition === "browser");
        assert.equal(rule.as, "*.js");
        assert.match(rule.loaders[0].loader, /index\.js$/);
        assert.equal(rule.loaders[0].options.target, "web");
        assert.equal(rule.loaders[0].options.web.asyncLoading, false);
    });

    test("still carries a webpack function for the --webpack build", () => {
        assert.equal(typeof rustWasmLoader.next({}, {}).webpack, "function");
    });

    test("preserves the wrapped config and merges existing turbopack rules", () => {
        const wrapped = rustWasmLoader.next(
            {
                output: "export",
                turbopack: { rules: { "*.svg": ["@svgr/webpack"] } },
            },
            {},
        );
        assert.equal(wrapped.output, "export");
        assert.deepEqual(wrapped.turbopack.rules["*.svg"], ["@svgr/webpack"]);
        assert.ok(Array.isArray(wrapped.turbopack.rules["*.rs"]));
    });
});

describe("next build under Turbopack (static export prerenders the wasm)", () => {
    // The first Next build pulls a large dependency tree and compiles Rust, so it
    // is slow. The whole build runs inside this hook under a generous timeout. No
    // `--webpack` flag, so this exercises the loader through `turbopack.rules`.
    before(
        () => {
            const result = spawnSync("npx", ["next", "build"], {
                cwd: root,
                encoding: "utf8",
                shell: process.platform === "win32",
            });
            assert.equal(
                result.status,
                0,
                `next build failed:\n${result.stdout}\n${result.stderr}`,
            );
        },
        { timeout: 600000 },
    );

    test("prerendered out/index.html contains the server-computed fibonacci", () => {
        const html = readFileSync(join(root, "out", "index.html"), "utf8");
        assert.match(html, /server fibonacci\(10\) = 55/);
        // React HTML-escapes the quotes in the prerendered markup.
        assert.match(html, /server cap\(&quot;hello&quot;\) = Hello/);
    });

    test("prerendered out/index.html contains the client-computed fibonacci", () => {
        const html = readFileSync(join(root, "out", "index.html"), "utf8");
        assert.match(html, /client fibonacci\(12\) = 144/);
    });
});
