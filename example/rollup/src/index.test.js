import { test, describe } from "node:test";
import assert from "node:assert/strict";
import rsLib from "./lib.rs";

describe("rollup", () => {
    test("fibonacci_bindgen", () => {
        assert.equal(rsLib.fibonacci_bindgen(10), 55);
    });

    test("fibonacci_default", () => {
        assert.equal(rsLib.fibonacci_default(10), 55);
    });

    test("cap", () => {
        assert.equal(rsLib.cap("hello"), "Hello");
    });
});
