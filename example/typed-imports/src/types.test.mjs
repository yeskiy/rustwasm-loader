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

// The members of the sidecar's `declare const _default: {...}` block alone. The
// class bodies it also declares sit outside that block, so reading the whole
// file would count `norm` or `free` as a top-level export.
function defaultExportBlock() {
    return fs
        .readFileSync(SIDECAR, "utf8")
        .match(/declare const _default: \{([\s\S]*?)\n\};/)[1];
}

// A function member reads `name(params): ret;`.
function typedFunctions() {
    return [
        ...defaultExportBlock().matchAll(/^\s+([A-Za-z_$][\w$]*)\s*\(/gm),
    ].map((match) => match[1]);
}

// A class member reads `Name: typeof Name;`.
function typedClasses() {
    return [
        ...defaultExportBlock().matchAll(
            /^\s+([A-Za-z_$][\w$]*): typeof \1;/gm,
        ),
    ].map((match) => match[1]);
}

test("precise types, floor fallback, and runtime fidelity", async () => {
    assert.ok(
        fs.existsSync(SIDECAR),
        "pretest should have generated the sidecar",
    );
    const members = typedFunctions();
    assert.deepEqual([...members].sort(), ["cap", "fibonacci"]);
    assert.deepEqual(typedClasses(), ["Point"]);

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

    // The class is on the default export, and a live instance answers.
    const point = new built.runtime.Point(3, 4);
    assert.equal(point.x, 3);
    assert.equal(point.norm(), 5);
    assert.equal(built.pointX, 3);
    assert.equal(built.pointNorm, 5);
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
    const content = fs.readFileSync(SIDECAR, "utf8");
    assert.match(content, /fibonacci\(n: number\): number;/);
    assert.match(content, /declare class Point \{/);
    assert.match(content, /Point: typeof Point;/);
});
