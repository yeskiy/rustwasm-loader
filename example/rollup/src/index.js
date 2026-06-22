import rsLib from "./lib.rs";

const NUM = 10;

console.log(`fibonacci_bindgen(${NUM}) = ${rsLib.fibonacci_bindgen(NUM)}`);
console.log(`fibonacci_default(${NUM}) = ${rsLib.fibonacci_default(NUM)}`);
console.log(`cap("hello") = ${rsLib.cap("hello")}`);
