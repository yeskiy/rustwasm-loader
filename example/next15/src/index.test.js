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
// This example pins Next.js 15 on purpose. The suite titles carry the version
// that actually ran, so a failure names the Next.js release it broke on.
const nextVersion = require("next/package.json").version;

describe(`the pinned Next.js (${nextVersion})`, () => {
    test("is a Next.js 15 release", () => {
        assert.match(nextVersion, /^15\./);
    });

    test("accepts --turbopack on next build (15.3 and later)", () => {
        const [major, minor] = nextVersion.split(".").map(Number);
        assert.equal(major, 15);
        assert.ok(
            minor >= 3,
            `next build --turbopack needs 15.3 or later, got ${nextVersion}`,
        );
    });
});

// Next.js 15.3 reads the Turbopack block at a top-level `turbopack` key, and up
// to 15.5 it reads a rule MAP keyed by condition rather than the Next.js 16 rule
// list. The helper picks the shape from the running version, so this asserts the
// config actually handed to the Next.js this example pins.
describe(`withRustWasm writes the Next.js 15 Turbopack shape (next ${nextVersion})`, () => {
    const config = rustWasmLoader.next({});

    test("puts the block at the top-level turbopack key", () => {
        assert.ok(config.turbopack);
        assert.equal(config.experimental, undefined);
    });

    test("writes the rule as a map keyed by condition", () => {
        const rule = config.turbopack.rules["*.rs"];
        assert.ok(
            !Array.isArray(rule),
            "Next.js 15 rejects the Next.js 16 rule list shape",
        );
        assert.deepEqual(Object.keys(rule).sort(), [
            "browser",
            "default",
            "edge-light",
        ]);
    });

    test("gives each pass the strategy that pass needs", () => {
        const rule = config.turbopack.rules["*.rs"];
        assert.equal(rule.default.loaders[0].options.target, "node");
        assert.equal(rule.browser.loaders[0].options.target, "web");
        assert.equal(
            rule["edge-light"].loaders[0].options.import.strategy,
            "module",
        );
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
// timeout. Edge routes need a server, so the proof runs against `next start`
// over HTTP.
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

// Next.js 15 builds with webpack by default, so the empty argument list is the
// webpack pass and `--turbopack` is the Turbopack one.
[
    { name: "webpack", args: [] },
    { name: "Turbopack", args: ["--turbopack"] },
].forEach((bundler) => {
    describe(`next build (${bundler.name}, next ${nextVersion}) prerenders and serves the wasm`, () => {
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

        test("/ prerenders the server- and client-computed triangular", async () => {
            const html = await (
                await fetch(`http://localhost:${ctx.port}/`)
            ).text();
            assert.match(html, /server triangular\(9\) = 45/);
            assert.match(html, /client triangular\(13\) = 91/);
            // React HTML-escapes the quotes in the prerendered markup.
            assert.match(html, /server shout\(&quot;hello&quot;\) = HELLO!/);
        });

        test("the edge page runs the wasm through the module delivery", async () => {
            const html = await (
                await fetch(`http://localhost:${ctx.port}/edge`)
            ).text();
            assert.match(html, /edge triangular\(7\) = 28/);
            assert.match(html, /edge shout\(&quot;edge&quot;\) = EDGE!/);
        });

        test("the edge route handler runs the wasm through the module delivery", async () => {
            const response = await fetch(
                `http://localhost:${ctx.port}/api/edge`,
            );
            assert.equal(response.status, 200);
            assert.deepEqual(await response.json(), {
                triangular: 21,
                shout: "ROUTE!",
            });
        });
    });
});
