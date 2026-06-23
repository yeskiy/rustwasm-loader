---
sidebar_position: 8
---

# Next.js Example

This example shows how to use rust-wasmpack-loader with [Next.js](https://nextjs.org/) (App Router). The loader ships a
`withRustWasm` helper that wraps your `next.config`, wiring the loader in so you can import `.rs` files from both Server
and Client Components. The helper picks the `node` strategy for the server and the `web` strategy for the client, and
inlines the WebAssembly bytes in both cases. The wrapped config works under both bundlers: webpack (`next build
--webpack`) and Turbopack (`next build`, the Next.js 16 default). See [Turbopack](#turbopack) below for what differs.

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

Next.js 16 defaults to Turbopack, and `withRustWasm` supports it for the inlined-bytes path. The helper registers the
loader under both `turbopack.rules` and the `webpack` function, so the same wrapped config builds either way: `next build`
runs under Turbopack, `next build --webpack` opts back to webpack. Setting both keys is fine; Next.js only rejects a
`webpack` config under Turbopack when no `turbopack` config is present, and the helper always sets one.

Turbopack picks the loader by its rule `condition`: `browser` is the client bundle (`web` strategy) and `{ not: "browser" }`
is the server bundle (`node` strategy). Both inline the bytes, so the same `.rs` resolves synchronously in Server and
Client Components, exactly as on webpack.

### What is supported under Turbopack

Only the inlined-bytes delivery, which is what this helper uses. That is the full feature set the helper offers on Next,
so a Turbopack build behaves the same as a webpack one for `.rs` imports.

### What is blocked under Turbopack

Turbopack implements only a core subset of the webpack loader API. It does not expose `this.emitFile` or
`this._compilation`, so any delivery that emits the `.wasm` as a separate asset cannot run under it:

- **`web.asyncLoading: true`** (fetch the `.wasm` at runtime) - needs `emitFile`. Blocked. The helper does not enable it.
- **`node.bundle: false`** (read the `.wasm` from disk at runtime) - emits a separate file. Blocked. The helper does not enable it.

Neither limitation affects this helper, because it only ever uses the inlined path. If you need an asset-emitting mode on
Next, build with `--webpack` (where `emitFile` is available) and configure the loader directly.

### Edge runtime

Edge is unsupported under both bundlers, for the same reason: the Edge runtime cannot instantiate WebAssembly from
inlined bytes. On the webpack pass the helper rejects an Edge `.rs` import with a clear build-time error (see
[above](#edge-runtime-limitation)). Turbopack has no per-rule signal for the Edge environment, so there is no equivalent
guard there; keep `.rs` imports out of Edge routes by adding `export const runtime = "nodejs"` to the route segment.

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

The default scripts build under Turbopack. To build with webpack instead, add `--webpack` to `dev` and `build`.

```json title="package.json"
{
    ...,
    "scripts": {
        "dev": "next dev",
        "build": "next build",
        "start": "next start"
    },
    ...
}
```

## Running the Example

```bash
# Build under Turbopack (the Next.js 16 default). Add --webpack to use webpack.
npm run build
```

## Helper Options

```javascript
rustWasmLoader.next(nextConfig, {
    logLevel: "info", // "verbose" | "info" | "warn" | "error" | "quiet"
});
```

---

:::tip One `.rs`, both component kinds, both bundlers
The same `import rsLib from "../lib.rs"` works from a Server Component and a Client Component, and the same wrapped config
builds under Turbopack and webpack. Next builds it with the `node` strategy for the server and `web` for the client, with
the bytes inlined either way, so there is nothing to await.
:::

:::warning Edge runtime
Importing a `.rs` into an Edge route fails the build with a clear message. Add `export const runtime = "nodejs"` to the
route segment to run it on the Node.js runtime instead.
:::
