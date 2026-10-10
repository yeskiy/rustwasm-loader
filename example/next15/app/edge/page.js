import rsLib from "../../lib.rs";

// Edge page that imports the same `.rs` through the `module` delivery, the only
// form the Edge runtime allows. Next does not prerender it, so the wasm runs per request.
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
