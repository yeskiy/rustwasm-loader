"use client";

import rsLib from "../lib.rs";

// Client Component importing the SAME `.rs`. For the client bundle it is built
// with the `web` strategy (inlined, non-async, so `rsLib` resolves
// synchronously). The server prerender of this component uses the `node` build.
// Either way the same import works.
const NUM = 13;

export default function Result() {
    return (
        <p id="client-triangular">
            {`client triangular(${NUM}) = ${rsLib.triangular(NUM)}`}
        </p>
    );
}
