"use client";

import rsLib from "../lib.rs";

// Client Component that imports the same `.rs`. The client bundle uses the `web`
// strategy and the server prerender uses `node`. In both, `rsLib` is synchronous.
const NUM = 12;

export default function Result() {
    return (
        <p id="client-fib">{`client fibonacci(${NUM}) = ${rsLib.fibonacci(NUM)}`}</p>
    );
}
