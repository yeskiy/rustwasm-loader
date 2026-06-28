import rsLib from "../../../lib.rs";

// Edge route handler importing the SAME `.rs`. On the Edge pass the loader uses
// the `module` delivery: the wasm arrives as a pre-compiled WebAssembly.Module
// (via a `?module` import) and is instantiated without a byte compile, the only
// form the Edge runtime allows. `rsLib` resolves synchronously, so the Rust
// exports are callable right here.
export const runtime = "edge";

export function GET(request) {
    const n = Number(new URL(request.url).searchParams.get("n") ?? "10");
    return Response.json({
        fibonacci: rsLib.fibonacci(n),
        cap: rsLib.cap("edge"),
    });
}
