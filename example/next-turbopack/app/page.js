import rsLib from "../lib.rs";
import Result from "./Result";

// Server Component that Turbopack builds with the `node` strategy. The static
// export runs the wasm at build time and writes the result into the HTML.
const NUM = 10;

export default function Home() {
    return (
        <main>
            <h1>rust-wasmpack-loader Next.js Turbopack example</h1>
            <p id="server-fib">
                {`server fibonacci(${NUM}) = ${rsLib.fibonacci(NUM)}`}
            </p>
            <p id="server-cap">{`server cap("hello") = ${rsLib.cap("hello")}`}</p>
            <Result />
        </main>
    );
}
