const test = require("node:test");
const assert = require("node:assert/strict");
const buildExportedBindings = require("./buildExportedBindings.util");

// Real wasm-bindgen 0.2.95 `--target web` glue lines for a crate exporting
// `fibonacci`, `cap`, and a `#[wasm_bindgen] struct Point` with a constructor.
const GLUE = [
    "let wasm;",
    "export function fibonacci(n) {",
    "    const ret = wasm.fibonacci(n);",
    "    return ret;",
    "}",
    "",
    "export function cap(s) {",
    "    return ret;",
    "}",
    "",
    "const PointFinalization = (typeof FinalizationRegistry === 'undefined')",
    "    ? { register: () => {}, unregister: () => {} }",
    "    : new FinalizationRegistry(ptr => wasm.__wbg_point_free(ptr >>> 0, 1));",
    "",
    "export class Point {",
    "    free() {}",
    "    constructor(x, y) {}",
    "}",
    "",
];

test("names every exported function on the bindings object", () => {
    const out = buildExportedBindings(GLUE);
    assert.match(out, /fibonacci: ?fibonacci/);
    assert.match(out, /cap: ?cap/);
});

test("names an exported class on the bindings object", () => {
    assert.match(buildExportedBindings(GLUE), /Point:Point/);
});

test("keeps the functions ahead of the classes", () => {
    const out = buildExportedBindings(GLUE);
    assert.ok(out.indexOf("cap") < out.indexOf("Point"));
});

test("leaves a function-only glue byte-identical to the legacy shape", () => {
    // The legacy inline harvest kept the leading space that `split("function")`
    // produces. A crate with no class must emit exactly the same module text.
    assert.equal(
        buildExportedBindings(GLUE.slice(0, 9)),
        "const exportedFunctions = { fibonacci: fibonacci, cap: cap};",
    );
});

test("emits an empty object when the glue exports nothing", () => {
    assert.equal(
        buildExportedBindings(["let wasm;", "const x = 1;"]),
        "const exportedFunctions = {};",
    );
});

test("ignores a class that is not exported", () => {
    assert.doesNotMatch(
        buildExportedBindings(["class Hidden {", "}"]),
        /Hidden/,
    );
});
