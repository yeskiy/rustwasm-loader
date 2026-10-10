const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const rustWasmLoader = require(".");
const { isolatedCrate, skip } = require("../test/helpers");

// Drives the loader with a thin loader context (the Turbopack-style shape: no
// `_compilation`, inline node build), the same surface the loader falls back to.
function runLoader(dir, loaderOptions) {
    return new Promise((resolve, reject) => {
        rustWasmLoader.call(
            {
                resourcePath: path.join(dir, "math.rs"),
                rootContext: dir,
                target: "node",
                async: () => (err, result) =>
                    err ? reject(err) : resolve(result),
                getOptions: () => loaderOptions,
                emitFile: () => undefined,
            },
            fs.readFileSync(path.join(dir, "math.rs"), "utf8"),
        );
    });
}

test(
    "the `types` option drives sidecar emission, off by default",
    { skip },
    async () => {
        const dir = isolatedCrate("rs-loader-types-");
        const sidecar = path.join(dir, "math.d.rs.ts");
        try {
            await runLoader(dir, {
                target: "node",
                node: { bundle: true },
                logLevel: "error",
                types: true,
            });
            assert.ok(
                fs.existsSync(sidecar),
                "types:true must write the sidecar",
            );
            assert.match(
                fs.readFileSync(sidecar, "utf8"),
                /fibonacci\(n: number\): number;/,
            );

            fs.rmSync(sidecar, { force: true });
            await runLoader(dir, {
                target: "node",
                node: { bundle: true },
                logLevel: "error",
            });
            assert.equal(
                fs.existsSync(sidecar),
                false,
                "the default (no `types`) must not write a sidecar",
            );
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    },
);
