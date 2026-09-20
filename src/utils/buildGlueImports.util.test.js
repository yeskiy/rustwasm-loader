const test = require("node:test");
const assert = require("node:assert/strict");
const buildGlueImports = require("./buildGlueImports.util");

// The init helpers of wasm-bindgen's `--target web` glue. Up to 0.2.104 the
// memory setup is its own function. From 0.2.105 `__wbg_get_imports` does the
// work and `__wbg_init_memory` is gone.
const GET_IMPORTS = [
    "function __wbg_get_imports() {",
    "    const imports = {};",
    "    return imports;",
    "}",
    "",
];

const FINALIZE = [
    "function __wbg_finalize_init(instance, module) {",
    "    wasm = instance.exports;",
    "    return wasm;",
    "}",
];

const WITH_INIT_MEMORY = [
    ...GET_IMPORTS,
    "function __wbg_init_memory(imports, memory) {",
    "",
    "}",
    "",
    ...FINALIZE,
];

const WITHOUT_INIT_MEMORY = [...GET_IMPORTS, ...FINALIZE];

test("calls __wbg_init_memory on glue of wasm-bindgen 0.2.104 and earlier", () => {
    assert.deepEqual(buildGlueImports(WITH_INIT_MEMORY), [
        "const __wbg_imports = __wbg_get_imports();",
        "__wbg_init_memory(__wbg_imports);",
    ]);
});

test("drops the call on glue of wasm-bindgen 0.2.105 and later", () => {
    const built = buildGlueImports(WITHOUT_INIT_MEMORY);
    assert.deepEqual(built, ["const __wbg_imports = __wbg_get_imports();"]);
    assert.doesNotMatch(built.join("\n"), /__wbg_init_memory/);
});

test("ignores a call site and reads the definition", () => {
    assert.deepEqual(
        buildGlueImports([
            ...WITHOUT_INIT_MEMORY,
            "    __wbg_init_memory(imports);",
        ]),
        ["const __wbg_imports = __wbg_get_imports();"],
    );
});

test("throws when the glue defines no __wbg_get_imports", () => {
    assert.throws(() => buildGlueImports(FINALIZE), {
        message: /defines no `__wbg_get_imports`/,
    });
});
