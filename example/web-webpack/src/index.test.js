import rsLib from "./lib.rs";
import fibonacci from "./fibonacci";

describe("web-webpack", () => {
    test("fibonacci_bindgen", async () => {
        expect((await rsLib).fibonacci_bindgen(10)).toBe(55);
    });

    test("fibonacci_default", async () => {
        expect((await rsLib).fibonacci_default(10)).toBe(55);
    });

    test("cap", async () => {
        expect((await rsLib).cap("test")).toBe("Test");
    });

    test("fibonacci", () => {
        expect(fibonacci(10)).toBe(55);
    });
});
