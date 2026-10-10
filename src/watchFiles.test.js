const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { recordPathFor } = require("./utils/rustSources.util");
const { tempDir } = require("../test/helpers");

// A stand-in build, so the test checks the declared files without wasm-pack.
require.cache[require.resolve("./pack")] = {
    id: require.resolve("./pack"),
    filename: require.resolve("./pack"),
    loaded: true,
    exports: async () => "export default 1;",
};

const loader = require(".");

const dir = tempDir("rs-watch-");
const entry = path.join(dir, "lib.rs");
const util = path.join(dir, "util.rs");
fs.writeFileSync(
    path.join(dir, "Cargo.toml"),
    '[package]\nname = "probe"\n\n[lib]\ncrate-type = ["cdylib"]\npath = "lib.rs"\n',
);
fs.writeFileSync(path.join(dir, "Cargo.lock"), "version = 4\n");
fs.writeFileSync(entry, "mod util;\n");
fs.writeFileSync(util, "pub fn v() -> u32 { 1 }\n");
fs.writeFileSync(recordPathFor(entry), JSON.stringify([util]));

const manifests = [path.join(dir, "Cargo.toml"), path.join(dir, "Cargo.lock")];

const startFolder = process.cwd();

test.after(() => {
    process.chdir(startFolder);
    fs.rmSync(recordPathFor(entry), { force: true });
    fs.rmSync(dir, { recursive: true, force: true });
});

const collector = () => {
    const files = new Set();
    return { files, add: (file) => files.add(file) };
};

test("the webpack loader declares the module files and the manifests", async () => {
    const { files, add } = collector();
    await new Promise((resolve, reject) => {
        loader.call(
            {
                resourcePath: entry,
                rootContext: dir,
                target: "node",
                getOptions: () => ({ node: { bundle: true } }),
                emitFile: () => undefined,
                addDependency: add,
                async: () => (error) => (error ? reject(error) : resolve()),
            },
            fs.readFileSync(entry, "utf8"),
        );
    });
    assert.deepEqual([...files].sort(), [util, ...manifests].sort());
});

test("the rollup plugin watches the entry, the module files and the manifests", async () => {
    const { files, add } = collector();
    process.chdir(dir);
    await loader
        .rollup({ target: "node" })
        .load.call({ addWatchFile: add }, entry);
    assert.deepEqual([...files].sort(), [entry, util, ...manifests].sort());
});

test("the vite plugin watches the entry, the module files and the manifests", () => {
    const { files, add } = collector();
    process.chdir(dir);
    loader.vite().transform.call({ addWatchFile: add }, "", `${entry}?v=1`);
    assert.deepEqual([...files].sort(), [entry, util, ...manifests].sort());
});

test("the esbuild plugin returns the entry, the module files and the manifests", async () => {
    const result = await new Promise((resolve) => {
        loader.esbuild().setup({
            initialOptions: { absWorkingDir: dir, platform: "node" },
            onLoad: (_options, callback) => resolve(callback({ path: entry })),
        });
    });
    assert.deepEqual(
        [...result.watchFiles].sort(),
        [entry, util, ...manifests].sort(),
    );
});
