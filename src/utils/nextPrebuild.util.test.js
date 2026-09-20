const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const prebuildEdgeWasm = require("./nextPrebuild.util");
const edgeWasmPath = require("./edgeCache.util");
const buildInputsHash = require("./buildInputsHash.util");

const { scanRsFiles } = prebuildEdgeWasm;

const SOURCE = "pub fn fib(n: u32) -> u32 { n }\n";

const MANIFEST = [
    "[package]",
    'name = "probe"',
    'version = "0.1.0"',
    "",
    "[lib]",
    'crate-type = ["cdylib"]',
    'path = "lib.rs"',
    "",
    "[dependencies]",
    'wasm-bindgen = "0.2.95"',
    "",
].join("\n");

// A throwaway project: a crate at the root plus the directories a scan has to
// pass over.
function project() {
    const dir = fs.realpathSync(
        fs.mkdtempSync(path.join(os.tmpdir(), "rs-prebuild-")),
    );
    fs.writeFileSync(path.join(dir, "lib.rs"), SOURCE);
    fs.writeFileSync(path.join(dir, "Cargo.toml"), MANIFEST);
    fs.writeFileSync(path.join(dir, "Cargo.lock"), "version = 4\n");
    ["node_modules", ".next", "target", ".git"].forEach((skipped) => {
        fs.mkdirSync(path.join(dir, skipped));
        fs.writeFileSync(path.join(dir, skipped, "buried.rs"), SOURCE);
    });
    fs.mkdirSync(path.join(dir, "src"));
    fs.writeFileSync(path.join(dir, "src", "extra.rs"), SOURCE);
    return dir;
}

const cleanup = (dir) => fs.rmSync(dir, { recursive: true, force: true });

test("finds the .rs files a project owns", () => {
    const dir = project();
    try {
        assert.deepEqual(scanRsFiles(dir).sort(), [
            path.join(dir, "lib.rs"),
            path.join(dir, "src", "extra.rs"),
        ]);
    } finally {
        cleanup(dir);
    }
});

test("passes over node_modules, .next, target and .git", () => {
    const dir = project();
    try {
        assert.doesNotMatch(scanRsFiles(dir).join("|"), /buried\.rs/);
    } finally {
        cleanup(dir);
    }
});

test("builds nothing when every wasm is already on disk", async () => {
    const dir = project();
    try {
        // Seed the cache with the digest of the one file the crate owns, so the
        // pre-build has no work and never reaches wasm-pack. The other `.rs`
        // belongs to no crate, and a scan passes over it.
        const owned = path.join(dir, "lib.rs");
        const cachePath = edgeWasmPath(
            dir,
            buildInputsHash(fs.readFileSync(owned, "utf8"), owned, dir),
        );
        fs.mkdirSync(path.dirname(cachePath), { recursive: true });
        fs.writeFileSync(cachePath, "seeded");
        assert.deepEqual(await prebuildEdgeWasm(dir, {}), {
            built: [],
            scanned: 2,
        });
    } finally {
        cleanup(dir);
    }
});

test("names the file in the error when a listed one owns no crate", async () => {
    const dir = fs.realpathSync(
        fs.mkdtempSync(path.join(os.tmpdir(), "rs-prebuild-bare-")),
    );
    try {
        fs.writeFileSync(path.join(dir, "stray.rs"), SOURCE);
        await assert.rejects(
            () => prebuildEdgeWasm(dir, {}, ["stray.rs"]),
            /cannot pre-build .*stray\.rs/,
        );
    } finally {
        cleanup(dir);
    }
});

test("a scan passes over a .rs file that owns no crate", async () => {
    const dir = fs.realpathSync(
        fs.mkdtempSync(path.join(os.tmpdir(), "rs-prebuild-stray-")),
    );
    try {
        fs.writeFileSync(path.join(dir, "stray.rs"), SOURCE);
        assert.deepEqual(await prebuildEdgeWasm(dir, {}), {
            built: [],
            scanned: 1,
        });
    } finally {
        cleanup(dir);
    }
});
