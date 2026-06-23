import rsLib from "../lib.rs";
import Result from "./Result";

// Server Component: the `.rs` is built with the `node` strategy, so `rsLib`
// resolves synchronously from inlined bytes. Static export prerenders this at
// build time, which runs the wasm and bakes the result into the HTML.
const NUM = 10;

export default function Home() {
    return (
        <main>
            <h1>rust-wasmpack-loader Next.js example</h1>
            <p id="server-fib">
                {`server fibonacci(${NUM}) = ${rsLib.fibonacci(NUM)}`}
            </p>
            <p id="server-cap">{`server cap("hello") = ${rsLib.cap("hello")}`}</p>
            <Result />
        </main>
    );
}
