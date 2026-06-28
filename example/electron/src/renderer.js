import lib from "./lib.rs";

const NUM = 10;
const result = lib.fibonacci_bindgen(NUM);

console.log(`fibonacci(${NUM}) = ${result}`);

const output = document.getElementById("result");
if (output) {
    output.textContent = `fibonacci(${NUM}) = ${result}`;
}
