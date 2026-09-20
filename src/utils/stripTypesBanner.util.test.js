const test = require("node:test");
const assert = require("node:assert/strict");
const stripTypesBanner = require("./stripTypesBanner.util");

// The head of wasm-bindgen's `--target web` glue. A build that keeps the
// typings starts it with the banner and a blank line. A build that drops them
// starts it with the first statement. Everything below the head is identical,
// so the fixtures only differ in the first two lines.
const BODY = [
    "export class Point {",
    "    __destroy_into_raw() {",
    "        const ptr = this.__wbg_ptr;",
    "    }",
    "}",
    "",
    "export function fibonacci(n) {",
    "    const ret = wasm.fibonacci(n);",
    "    return ret >>> 0;",
    "}",
].join("\n");

const BANNER = '/* @ts-self-types="./out.wasm.d.ts" */';

test("cuts the banner and its blank line off a typings build", () => {
    assert.equal(stripTypesBanner(`${BANNER}\n\n${BODY}`), BODY);
});

test("cuts a banner that no blank line follows", () => {
    assert.equal(stripTypesBanner(`${BANNER}\n${BODY}`), BODY);
});

test("leaves the glue of a --no-typescript build untouched", () => {
    assert.equal(stripTypesBanner(BODY), BODY);
});

test("reads the name out of the banner instead of matching one name", () => {
    ['/* @ts-self-types="./math.d.ts" */', '/*@ts-self-types="./a.d.ts"*/']
        .map((banner) => stripTypesBanner(`${banner}\n\n${BODY}`))
        .forEach((stripped) => assert.equal(stripped, BODY));
});

test("cuts the banner on CRLF glue", () => {
    assert.equal(stripTypesBanner(`${BANNER}\r\n\r\n${BODY}`), BODY);
});

test("keeps a banner that is not the first line of the glue", () => {
    const withLater = `${BODY}\n${BANNER}`;
    assert.equal(stripTypesBanner(withLater), withLater);
});
