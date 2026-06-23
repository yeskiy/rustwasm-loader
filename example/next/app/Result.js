"use client";

import rsLib from "../lib.rs";

// Client Component importing the SAME `.rs`. For the client bundle it is built
// with the `web` strategy (inlined, non-async, so `rsLib` resolves
// synchronously); the server prerender of this component uses the `node` build.
// Either way the same import works.
const NUM = 12;

export default function Result() {
    return (
        <p id="client-fib">{`client fibonacci(${NUM}) = ${rsLib.fibonacci(NUM)}`}</p>
    );
}
