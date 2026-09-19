import rsLib from "../../lib.rs";

// This Edge page imports the SAME `.rs`. On the Edge pass the loader uses the
// `module` delivery: the wasm arrives as a pre-compiled WebAssembly.Module (via
// a `?module` import) and is instantiated without a byte compile, the only form
// the Edge runtime allows. `rsLib` resolves synchronously, so the Rust exports
// are callable right here. Next never prerenders an Edge page, so the wasm runs
// on the Edge runtime for every request.
export const runtime = "edge";

const NUM = 10;

export default function EdgePage() {
    return (
        <main>
            <p id="edge-fib">{`edge fibonacci(${NUM}) = ${rsLib.fibonacci(NUM)}`}</p>
            <p id="edge-cap">{`edge cap("edge") = ${rsLib.cap("edge")}`}</p>
        </main>
    );
}
