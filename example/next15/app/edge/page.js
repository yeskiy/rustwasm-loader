import rsLib from "../../lib.rs";

// Edge page importing the SAME `.rs`. On the Edge pass the loader uses the
// `module` delivery: the wasm arrives as a pre-compiled WebAssembly.Module (via
// a `?module` import) and is instantiated without a byte compile, the only form
// the Edge runtime allows. `rsLib` resolves synchronously, so the Rust exports
// are callable right here. Next never prerenders an Edge page, so the wasm runs
// on the Edge runtime for every request.
export const runtime = "edge";

const NUM = 7;

export default function EdgePage() {
    return (
        <main>
            <p id="edge-triangular">
                {`edge triangular(${NUM}) = ${rsLib.triangular(NUM)}`}
            </p>
            <p id="edge-shout">{`edge shout("edge") = ${rsLib.shout("edge")}`}</p>
        </main>
    );
}
