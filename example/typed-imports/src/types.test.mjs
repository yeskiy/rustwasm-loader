import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const webpack = require("webpack");
const webpackConfig = require("../webpack.config");

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, "..");
const SIDECAR = path.join(ROOT, "math.d.rs.ts");
const DIST = path.join(ROOT, "dist", "bundle.js");
const TSC = path.join(ROOT, "node_modules", "typescript", "bin", "tsc");

function runTsc(configName) {
    return spawnSync(
        process.execPath,
        [TSC, "--noEmit", "-p", path.join(ROOT, configName)],
        { cwd: ROOT, encoding: "utf8" },
    );
}

function buildWebpack() {
    return new Promise((resolve, reject) => {
        webpack(webpackConfig, (err, stats) => {
            if (err) {
                reject(err);
                return;
            }
            if (stats.hasErrors()) {
                reject(new Error(stats.toString({ all: false, errors: true })));
                return;
            }
            resolve();
        });
    });
}

function typedMembers() {
    return [
        ...fs
            .readFileSync(SIDECAR, "utf8")
            .matchAll(/^\s+([A-Za-z_$][\w$]*)\s*\(/gm),
    ].map((match) => match[1]);
}

test("precise types, floor fallback, and runtime fidelity", async () => {
    assert.ok(
        fs.existsSync(SIDECAR),
        "pretest should have generated the sidecar",
    );
    const members = typedMembers();
    assert.deepEqual([...members].sort(), ["cap", "fibonacci"]);

    // Correct usage type-checks against the precise sidecar.
    const precise = runTsc("tsconfig.json");
    assert.equal(
        precise.status,
        0,
        `precise typecheck failed:\n${precise.stdout}${precise.stderr}`,
    );

    // An unknown export is a type error: the `@ts-expect-error` stays used, so
    // tsc exits 0. A missing error would flip the directive and fail the build.
    const reject = runTsc("tsconfig.reject.json");
    assert.equal(
        reject.status,
        0,
        `reject typecheck failed:\n${reject.stdout}${reject.stderr}`,
    );

    // With the sidecar gone, the ambient floor keeps the import valid (loose).
    fs.rmSync(SIDECAR, { force: true });
    const floor = runTsc("tsconfig.json");
    assert.equal(
        floor.status,
        0,
        `floor fallback failed:\n${floor.stdout}${floor.stderr}`,
    );

    // The fidelity guard: every typed member is a real, callable runtime export.
    await buildWebpack();
    delete require.cache[require.resolve(DIST)];
    const built = require(DIST);
    members.forEach((name) =>
        assert.equal(
            typeof built.runtime[name],
            "function",
            `${name} is typed but missing at runtime`,
        ),
    );
    assert.equal(built.fib10, 55);
    assert.equal(built.capped, "Hello");
});

test("the webpack build writes the sidecar when `types: true`", async () => {
    // Independent of the `gen-types` CLI pretest: the loader emits the sidecar
    // during a normal build, reusing the build it already runs.
    fs.rmSync(SIDECAR, { force: true });
    assert.equal(fs.existsSync(SIDECAR), false);

    await buildWebpack();

    assert.ok(
        fs.existsSync(SIDECAR),
        "the build with types:true must write the sidecar",
    );
    assert.match(
        fs.readFileSync(SIDECAR, "utf8"),
        /fibonacci\(n: number\): number;/,
    );
});
