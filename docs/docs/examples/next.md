---
sidebar_position: 8
---

# Next.js Example

This example shows how to use rust-wasmpack-loader with [Next.js](https://nextjs.org/) (App Router). The loader ships a
`withRustWasm` helper that wraps your `next.config`, wiring the loader into Next's webpack passes so you can import `.rs`
files from both Server and Client Components. The helper picks the `node` strategy for the server and the `web` strategy
for the client, and inlines the WebAssembly bytes in both cases.

## How delivery is decided

Next runs the webpack build once per environment. The helper reads the `isServer` and `nextRuntime` signals Next passes
to `webpack(config, options)` and registers the right rule for each:

| Pass                  | `isServer` | `nextRuntime` | Strategy   | WASM delivery       |
|-----------------------|------------|---------------|------------|---------------------|
| Server (SSR/prerender) | `true`     | `"nodejs"`    | `node`     | Inlined as bytes    |
| Client                | `false`    | `undefined`   | `web`      | Inlined as bytes    |
| Edge                  | `true`     | `"edge"`      | guard      | Rejected (see below) |

Both real passes inline the bytes, so the same `.rs` import resolves synchronously on the server and on the client. No
separate `.wasm` asset is emitted, which sidesteps Next's `.wasm` output-file tracing.

## Edge runtime limitation

The Edge runtime cannot instantiate WebAssembly from inlined bytes, so a `.rs` imported into an Edge route would compile
but fail at runtime. The helper routes the Edge pass through a guard loader that throws a clear build-time error only if a
`.rs` is actually pulled into the Edge graph. Move the import into a Node.js runtime route to fix it:

```javascript
export const runtime = "nodejs";
```

Real Edge `.wasm` support (`import "./x.wasm?module"`) is a planned enhancement.

## Turbopack

Next.js 16 defaults to Turbopack, and `next build` fails when a custom webpack config is present. Since this helper wires
the loader through webpack, opt out of Turbopack with the `--webpack` flag (`next build --webpack`, `next dev --webpack`).
Turbopack support is tracked separately.

## Project Structure

```
next-example/
├── app/
│   ├── layout.js           # Root layout (App Router)
│   ├── page.js             # Server Component importing lib.rs
│   └── Result.js           # Client Component importing the same lib.rs
├── src/
│   └── index.test.js       # Helper unit test + build proof (node:test)
├── lib.rs                  # Rust WebAssembly code
├── next.config.mjs         # Next config wrapped with withRustWasm
├── out/                    # Static export output (next build)
├── Cargo.toml              # Rust configuration
└── package.json            # Dependencies and scripts
```

## Setup Instructions

### 1. Initialize Project

```bash
npx create-next-app@latest my-next-wasm-app
cd my-next-wasm-app
```

### 2. Install Dependencies

```bash
npm install --save-dev rust-wasmpack-loader
```

### 3. Create Cargo.toml

```toml title="Cargo.toml"
[package]
name = "next-wasm-example"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
wasm-bindgen = "0.2.95"
```

### 4. Create Rust Code

```rust title="lib.rs"
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn fibonacci(n: u32) -> u32 {
    match n {
        0 => 0,
        1 => 1,
        _ => fibonacci(n - 1) + fibonacci(n - 2),
    }
}

#[wasm_bindgen]
pub fn cap(s: &str) -> String {
    s[0..1].to_uppercase() + &s[1..]
}
```

### 5. Wrap the Next Config

```javascript title="next.config.mjs"
import rustWasmLoader from "rust-wasmpack-loader";

export default rustWasmLoader.next({
    // your usual Next.js config goes here
});
```

### 6. Import from a Server Component

```javascript title="app/page.js"
import rsLib from "../lib.rs";

// Built with the `node` strategy; `rsLib` resolves synchronously from inlined
// bytes and runs at prerender time.
export default function Home() {
    return <p>{`fibonacci(10) = ${rsLib.fibonacci(10)}`}</p>;
}
```

### 7. Import from a Client Component

```javascript title="app/Result.js"
"use client";

import rsLib from "../lib.rs";

// The same import, built with the `web` strategy for the client bundle.
export default function Result() {
    return <p>{`fibonacci(12) = ${rsLib.fibonacci(12)}`}</p>;
}
```

### 8. Update Package.json

```json title="package.json"
{
    ...,
    "scripts": {
        "dev": "next dev --webpack",
        "build": "next build --webpack",
        "start": "next start"
    },
    ...
}
```

## Running the Example

```bash
# Build (opts out of Turbopack so the webpack loader runs)
npm run build
```

## Helper Options

```javascript
rustWasmLoader.next(nextConfig, {
    logLevel: "info", // "verbose" | "info" | "warn" | "error" | "quiet"
});
```

---

:::tip One `.rs`, both component kinds
The same `import rsLib from "../lib.rs"` works from a Server Component and a Client Component. Next builds it with the
`node` strategy for the server and `web` for the client, with the bytes inlined either way, so there is nothing to await.
:::

:::warning Edge runtime
Importing a `.rs` into an Edge route fails the build with a clear message. Add `export const runtime = "nodejs"` to the
route segment to run it on the Node.js runtime instead.
:::
