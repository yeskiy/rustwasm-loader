import rsLib from "./lib.rs";
import fibonacci from "./fibonacci";
import square from "./square.rs";

describe("node-webpack", () => {
    test("fibonacci_bindgen", () => {
        expect(rsLib.fibonacci_bindgen(10)).toBe(55);
    });
    test("fibonacci_default", () => {
        expect(rsLib.fibonacci_default(10)).toBe(55);
    });

    test("cap", () => {
        expect(rsLib.cap("hello")).toBe("Hello");
    });

    test("fibonacci", () => {
        expect(fibonacci(10)).toBe(55);
    });

    test("a second entry of the same crate keeps its own exports", () => {
        expect(square.square(7)).toBe(49);
        expect(square.fibonacci_bindgen).toBeUndefined();
        expect(rsLib.square).toBeUndefined();
    });
});
