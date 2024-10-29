import rsLib from "./lib.rs";
import fibonacci from "./fibonacci";

const NUM = 10;

console.time("Fibonacci (wasm-bindgen)");
console.log(rsLib.fibonacci_bindgen(NUM));
console.timeEnd("Fibonacci (wasm-bindgen)");

console.time("Fibonacci (wasm-Default)");
console.log(rsLib.fibonacci_default(NUM));
console.timeEnd("Fibonacci (wasm-Default)");

console.time("Fibonacci (js-Default)");
console.log(fibonacci(NUM));
console.timeEnd("Fibonacci (js-Default)");
