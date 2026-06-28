import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync, spawn } from "node:child_process";
import { createServer } from "node:net";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const rustWasmLoader = require("rust-wasmpack-loader");

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const isWin = process.platform === "win32";

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

    test("edge pass uses the loader with the module delivery", () => {
        const rule = pushedRuleFor({ isServer: true, nextRuntime: "edge" });
        assert.match(rule.use[0].loader, /index\.js$/);
        assert.equal(rule.use[0].options.target, "web");
        assert.equal(rule.use[0].options.import.strategy, "module");
    });

    test("preserves the wrapped config and chains a user webpack()", () => {
        const seen = [];
        const wrapped = rustWasmLoader.next(
            {
                output: "standalone",
                webpack: (config) => {
                    seen.push(config.module.rules.length);
                    return { ...config, userRan: true };
                },
            },
            {},
        );
        assert.equal(wrapped.output, "standalone");
        const result = wrapped.webpack(
            { module: { rules: [] } },
            { isServer: false },
        );
        // The user hook saw the rule the helper added, and its return flows out.
        assert.deepEqual(seen, [1]);
        assert.equal(result.userRan, true);
    });
});

// Picks a free port by binding to 0 and reading the assigned one back.
const freePort = () =>
    new Promise((resolve, reject) => {
        const probe = createServer();
        probe.on("error", reject);
        probe.listen(0, () => {
            const { port } = probe.address();
            probe.close(() => resolve(port));
        });
    });

// Polls the server until it answers (any status) or the attempts run out.
const waitForHttp = async (url, attempts) => {
    try {
        await fetch(url);
    } catch (err) {
        if (attempts <= 1) {
            throw new Error(
                `server never became ready at ${url}: ${err.message}`,
            );
        }
        await new Promise((resume) => {
            setTimeout(resume, 500);
        });
        await waitForHttp(url, attempts - 1);
    }
};

// Kills `next start` and the workers it spawned: a process-group signal on POSIX,
// taskkill on Windows where child.kill() leaves the tree running.
const stopServer = (server) =>
    isWin
        ? spawnSync("taskkill", ["/pid", String(server.pid), "/T", "/F"])
        : process.kill(-server.pid, "SIGTERM");

// Builds the example with the given bundler flags, then serves it and waits for
// readiness. The Rust compile makes the build slow, so callers give it a generous
// timeout. Edge routes need a server (the static export of earlier versions could
// not host one), so the proof runs against `next start` over HTTP.
const buildAndServe = async (buildArgs, port) => {
    const build = spawnSync("npx", ["next", "build", ...buildArgs], {
        cwd: root,
        encoding: "utf8",
        shell: isWin,
    });
    assert.equal(
        build.status,
        0,
        `next build failed:\n${build.stdout}\n${build.stderr}`,
    );
    const server = spawn("npx", ["next", "start", "-p", String(port)], {
        cwd: root,
        shell: isWin,
        detached: !isWin,
        stdio: "ignore",
    });
    await waitForHttp(`http://localhost:${port}/`, 80);
    return server;
};

[
    { name: "webpack", args: ["--webpack"] },
    { name: "Turbopack", args: [] },
].forEach((bundler) => {
    describe(`next build (${bundler.name}) prerenders and serves the wasm`, () => {
        const ctx = {};

        before(
            async () => {
                ctx.port = await freePort();
                ctx.server = await buildAndServe(bundler.args, ctx.port);
            },
            { timeout: 600000 },
        );

        after(() => {
            if (ctx.server) {
                stopServer(ctx.server);
            }
        });

        test("/ prerenders the server- and client-computed fibonacci", async () => {
            const html = await (
                await fetch(`http://localhost:${ctx.port}/`)
            ).text();
            assert.match(html, /server fibonacci\(10\) = 55/);
            assert.match(html, /client fibonacci\(12\) = 144/);
            // React HTML-escapes the quotes in the prerendered markup.
            assert.match(html, /server cap\(&quot;hello&quot;\) = Hello/);
        });

        test("the edge route runs the wasm through the module delivery", async () => {
            const result = await (
                await fetch(`http://localhost:${ctx.port}/api/edge?n=10`)
            ).json();
            assert.equal(result.fibonacci, 55);
            assert.equal(result.cap, "Edge");
        });
    });
});
