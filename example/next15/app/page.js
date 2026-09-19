import rsLib from "../lib.rs";
import Result from "./Result";

// Server Component: the `.rs` is built with the `node` strategy, so `rsLib`
// resolves synchronously from inlined bytes. Next prerenders this page at build
// time, which runs the wasm and bakes the result into the HTML.
const NUM = 9;

export default function Home() {
    return (
        <main>
            <h1>rust-wasmpack-loader Next.js 15 example</h1>
            <p id="server-triangular">
                {`server triangular(${NUM}) = ${rsLib.triangular(NUM)}`}
            </p>
            <p id="server-shout">{`server shout("hello") = ${rsLib.shout("hello")}`}</p>
            <Result />
        </main>
    );
}
