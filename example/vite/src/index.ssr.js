import rsLib from "./lib.rs";

const NUM = 10;

const results = {
    fibonacci_bindgen: rsLib.fibonacci_bindgen(NUM),
    fibonacci_default: rsLib.fibonacci_default(NUM),
    cap: rsLib.cap("hello"),
};

console.log(`fibonacci_bindgen(${NUM}) = ${results.fibonacci_bindgen}`);
console.log(`fibonacci_default(${NUM}) = ${results.fibonacci_default}`);
console.log(`cap("hello") = ${results.cap}`);

export default results;
