const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const withRustWasm = require("./next");

// A throwaway project that holds one buildable crate, so a pre-build that
// scanned it would find real work.
function project() {
    const dir = fs.realpathSync(
        fs.mkdtempSync(path.join(os.tmpdir(), "rs-next-shape-")),
    );
    fs.writeFileSync(
        path.join(dir, "lib.rs"),
        "pub fn fib(n: u32) -> u32 { n }\n",
    );
    fs.writeFileSync(
        path.join(dir, "Cargo.toml"),
        [
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
        ].join("\n"),
    );
    return dir;
}

// The helper returns a value Next.js calls, so the pre-build has somewhere
// asynchronous to run. The same value carries the config keys, because the
// example suites and any user may read them instead of calling.

test("returns a value Next.js calls", () => {
    assert.equal(typeof withRustWasm({}), "function");
});

test("carries the Turbopack block as a readable property", () => {
    assert.ok(withRustWasm({}).turbopack.rules["*.rs"]);
});

test("carries webpack() as a readable property", () => {
    assert.equal(
        typeof withRustWasm({}).webpack({ module: { rules: [] } }, {}),
        "object",
    );
});

test("keeps the wrapped config readable", () => {
    assert.equal(withRustWasm({ output: "standalone" }).output, "standalone");
});

test("the call result and the properties are one configuration", async () => {
    const wrapped = withRustWasm({ output: "standalone" }, { prebuild: [] });
    const called = await wrapped();
    assert.equal(called.output, wrapped.output);
    assert.equal(called.turbopack, wrapped.turbopack);
    assert.equal(called.webpack, wrapped.webpack);
});

test("prebuild:false returns the plain object instead", () => {
    const wrapped = withRustWasm({}, { prebuild: false });
    assert.equal(typeof wrapped, "object");
    assert.ok(wrapped.turbopack.rules["*.rs"]);
});

test("an empty list asks for no pre-build work", async (t) => {
    const dir = project();
    const cwd = process.cwd();
    const wrapped = withRustWasm({ output: "standalone" }, { prebuild: [] });
    process.chdir(dir);
    // The pre-build reaches a project through this one call, so a scan cannot
    // happen without it. Throwing from it turns a scan into an immediate
    // failure instead of a wasm-pack run the test would wait on.
    const readdir = t.mock.method(fs, "readdirSync", () => {
        throw new Error("the pre-build scanned the project");
    });
    try {
        const called = await wrapped();

        assert.equal(readdir.mock.callCount(), 0);
        assert.equal(fs.existsSync(path.join(dir, "node_modules")), false);

        assert.equal(called.output, "standalone");
        assert.ok(called.turbopack.rules["*.rs"]);
        assert.match(
            called.webpack({ module: { rules: [] } }, {}).module.rules.at(-1)
                .test.source,
            /\\\.rs\$/,
        );
    } finally {
        readdir.mock.restore();
        process.chdir(cwd);
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test("rejects an option the schema does not define", () => {
    assert.throws(() => withRustWasm({}, { nope: true }));
});
