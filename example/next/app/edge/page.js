import rsLib from "../../lib.rs";

// Edge page that imports the same `.rs` through the `module` delivery, the only
// form the Edge runtime allows. Next does not prerender it, so the wasm runs per request.
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
