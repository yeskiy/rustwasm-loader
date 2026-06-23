"use client";

import rsLib from "../lib.rs";

// Client Component importing the SAME `.rs`. Turbopack picks the loader by its
// `browser` rule condition, so the client bundle is built with the `web` strategy
// (inlined, non-async, `rsLib` resolves synchronously); the server prerender of
// this component uses the `node` build. Either way the same import works.
const NUM = 12;

export default function Result() {
    return (
        <p id="client-fib">{`client fibonacci(${NUM}) = ${rsLib.fibonacci(NUM)}`}</p>
    );
}
