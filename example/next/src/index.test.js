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

// Drives the helper's webpack() for one Next.js pass against a throwaway config
// and returns the single rule it added (the helper returns a new config rather
// than mutating the one it receives).
const pushedRuleFor = (context) =>
    rustWasmLoader.next({}, {}).webpack({ module: { rules: [] } }, context)
        .module.rules[0];

describe("withRustWasm helper", () => {
    test("server pass uses the loader with the node target", () => {
        const rule = pushedRuleFor({ isServer: true, nextRuntime: "nodejs" });
        assert.match(rule.use[0].loader, /index\.js$/);
        assert.equal(rule.use[0].options.target, "node");
    });

    test("client pass uses the loader with the web target", () => {
        const rule = pushedRuleFor({ isServer: false });
        assert.match(rule.use[0].loader, /index\.js$/);
        assert.equal(rule.use[0].options.target, "web");
    });

    test("edge pass uses the guard loader", () => {
        const rule = pushedRuleFor({ isServer: true, nextRuntime: "edge" });
        assert.match(rule.use[0].loader, /next-edge-guard\.js$/);
        assert.equal(rule.use[0].options, undefined);
    });

    test("preserves the wrapped config and chains a user webpack()", () => {
        const seen = [];
        const wrapped = rustWasmLoader.next(
            {
                output: "export",
                webpack: (config) => {
                    seen.push(config.module.rules.length);
                    return { ...config, userRan: true };
                },
            },
            {},
        );
        assert.equal(wrapped.output, "export");
        const result = wrapped.webpack(
            { module: { rules: [] } },
            { isServer: false },
        );
        // The user hook saw the rule the helper added, and its return flows out.
        assert.deepEqual(seen, [1]);
        assert.equal(result.userRan, true);
    });
});

describe("next build (static export prerenders the wasm)", () => {
    // The first Next build pulls a large dependency tree and compiles Rust, so it
    // is slow. The whole build runs inside this hook under a generous timeout.
    before(
        () => {
            const result = spawnSync("npx", ["next", "build", "--webpack"], {
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
