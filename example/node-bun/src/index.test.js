import { expect, test, describe } from "bun:test";
import rsLib from "./lib.rs";
import fibonacci from "./fibonacci";

describe("node-bun", () => {
    test("fibonacci_bindgen", () => {
        expect(rsLib.fibonacci_bindgen(10)).toBe(55);
    });
    test("fibonacci_default", () => {
        expect(rsLib.fibonacci_default(10)).toBe(55);
    });

    test("fibonacci", () => {
        expect(fibonacci(10)).toBe(55);
    });
});
