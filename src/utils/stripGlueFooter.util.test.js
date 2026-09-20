const test = require("node:test");
const assert = require("node:assert/strict");
const stripGlueFooter = require("./stripGlueFooter.util");

// The last lines of wasm-bindgen's `--target web` glue. The body above the
// footer is identical in both versions, so the fixtures only differ in the tail.
const BODY = [
    "export function fibonacci(n) {",
    "    const ret = wasm.fibonacci(n);",
    "    return ret >>> 0;",
    "}",
    "",
    "async function __wbg_init(module_or_path) {",
    "    if (wasm !== undefined) return wasm;",
    "    return __wbg_finalize_init(instance, module);",
    "}",
    "",
];

const SPLIT_FOOTER = [
    ...BODY,
    "export { initSync };",
    "export default __wbg_init;",
].join("\n");

const MERGED_FOOTER = [
    ...BODY,
    "export { initSync, __wbg_init as default };",
].join("\n");

test("cuts the split footer of wasm-bindgen 0.2.106 and earlier", () => {
    const kept = stripGlueFooter(SPLIT_FOOTER.split("\n"));
    assert.deepEqual(kept, BODY);
    assert.doesNotMatch(kept.join("\n"), /export default/);
});

test("cuts the merged footer of wasm-bindgen 0.2.107 and later", () => {
    const kept = stripGlueFooter(MERGED_FOOTER.split("\n"));
    assert.deepEqual(kept, BODY);
    assert.doesNotMatch(kept.join("\n"), /as default/);
});

test("keeps the __wbg_init definition both branches call at runtime", () => {
    [SPLIT_FOOTER, MERGED_FOOTER].forEach((glue) => {
        assert.match(
            stripGlueFooter(glue.split("\n")).join("\n"),
            /async function __wbg_init\(module_or_path\) {/,
        );
    });
});

test("throws when the glue holds no footer", () => {
    assert.throws(() => stripGlueFooter(BODY), {
        message: /no `export { initSync \.\.\. }` footer/,
    });
});
