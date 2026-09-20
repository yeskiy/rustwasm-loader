const test = require("node:test");
const assert = require("node:assert/strict");
const withRustWasm = require("./next");

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

test("an empty list asks for no pre-build work", async () => {
    await withRustWasm({}, { prebuild: [] })();
});

test("rejects an option the schema does not define", () => {
    assert.throws(() => withRustWasm({}, { nope: true }));
});
