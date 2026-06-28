const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const rustWasmLoader = require(".");
const findWasmPack = require("./utils/findWasmPack.util");

const CRATE = path.join(__dirname, "..", "example", "typed-imports");

const skip = (() => {
    try {
        findWasmPack();
        return false;
    } catch {
        return "wasm-pack is not installed";
    }
})();

// An isolated copy of the example crate with a unique marker, so this test owns
// its own content-addressed build dir and sidecar.
function isolatedCrate() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rs-loader-types-"));
    ["Cargo.toml", "Cargo.lock", "math.rs"].forEach((file) =>
        fs.copyFileSync(path.join(CRATE, file), path.join(dir, file)),
    );
    fs.appendFileSync(
        path.join(dir, "math.rs"),
        `\n// ${path.basename(dir)}\n`,
    );
    return dir;
}

// Drives the loader with a thin loader context (the Turbopack-style shape: no
// `_compilation`, inline node build), the same surface the loader falls back to.
function runLoader(dir, loaderOptions) {
    const source = fs.readFileSync(path.join(dir, "math.rs"), "utf8");
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
            source,
        );
    });
}

test(
    "the `types` option drives sidecar emission, off by default",
    { skip },
    async () => {
        const dir = isolatedCrate();
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
