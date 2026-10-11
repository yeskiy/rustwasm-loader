import { test, describe } from "node:test";
import assert from "node:assert/strict";
import rsLib from "../app/src/lib.rs";

describe("workspace", () => {
    test("fibonacci from the sibling crate", () => {
        assert.equal(rsLib.fibonacci(10), 55);
    });

    test("cap from the sibling crate", () => {
        assert.equal(rsLib.cap("hello"), "Hello");
    });
});
