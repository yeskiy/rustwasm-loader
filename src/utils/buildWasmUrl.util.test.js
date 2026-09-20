const test = require("node:test");
const assert = require("node:assert/strict");
const buildWasmUrl = require("./buildWasmUrl.util");

const WASM = "abc123.module.wasm";
const DEFAULT_MODIFIER = ["/"];

const urlFor = (publicPath, modifier = DEFAULT_MODIFIER) =>
    buildWasmUrl(modifier, publicPath, WASM);

test("a root-relative public path resolves against the server root", () => {
    assert.deepEqual(
        {
            empty: urlFor(""),
            root: urlFor("/"),
            absoluteFolder: urlFor("/assets/"),
            relativeFolder: urlFor("assets/"),
        },
        {
            empty: `/${WASM}`,
            root: `/${WASM}`,
            absoluteFolder: `/assets/${WASM}`,
            relativeFolder: `/assets/${WASM}`,
        },
    );
});

test("an absolute public path keeps its scheme and host", () => {
    assert.equal(
        urlFor("https://cdn.example.com/"),
        `https://cdn.example.com/${WASM}`,
    );
});

test("an absolute public path keeps a folder under the host", () => {
    assert.equal(
        urlFor("https://cdn.example.com/static/v2/"),
        `https://cdn.example.com/static/v2/${WASM}`,
    );
});

test("an absolute public path without a trailing slash gets one", () => {
    assert.equal(
        urlFor("http://localhost:3000/static"),
        `http://localhost:3000/static/${WASM}`,
    );
});

test("a protocol-relative public path keeps both leading slashes", () => {
    assert.equal(urlFor("//cdn.example.com/"), `//cdn.example.com/${WASM}`);
});

test("the path modifier applies only to a root-relative public path", () => {
    assert.deepEqual(
        {
            rootRelative: urlFor("/assets/", ["/", "nested"]),
            absolute: urlFor("https://cdn.example.com/", ["/", "nested"]),
        },
        {
            rootRelative: `/nested/assets/${WASM}`,
            absolute: `https://cdn.example.com/${WASM}`,
        },
    );
});
