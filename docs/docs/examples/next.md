---
sidebar_position: 8
---

# Next.js example

This example shows how to use rust-wasmpack-loader with [Next.js](https://nextjs.org/) (App Router). The loader ships a
`withRustWasm` helper that wraps your `next.config` and wires the loader in, so you import `.rs` files from Server
Components, Client Components, and Edge routes alike. The helper picks the strategy per environment: `node` for the
server and `web` for the client, both with the WebAssembly bytes inlined, and a separate `module` delivery for the Edge
runtime. The wrapped config works under both bundlers: webpack (`next build --webpack`) and Turbopack (`next build`, the
Next.js 16 default). See [Turbopack](#turbopack) below for what differs.

## How delivery is decided

Next runs the webpack build once per environment. The helper reads the `isServer` and `nextRuntime` signals Next passes
to `webpack(config, options)` and registers the right rule for each:

| Pass                   | `isServer` | `nextRuntime` | Strategy | WASM delivery               |
|------------------------|------------|---------------|----------|-----------------------------|
| Server (SSR/prerender) | `true`     | `"nodejs"`    | `node`   | Inlined as bytes            |
| Client                 | `false`    | `undefined`   | `web`    | Inlined as bytes            |
| Edge                   | `true`     | `"edge"`      | `web`    | Pre-compiled module (`?module`) |

The server and client passes inline the bytes, so the same `.rs` import resolves synchronously there, and no separate
`.wasm` asset is emitted. The Edge pass cannot compile wasm from bytes at runtime, so it ships the wasm as a pre-compiled
`WebAssembly.Module` instead. See [Edge runtime](#edge-runtime) below.

## Edge runtime

The Edge runtime cannot instantiate WebAssembly from inlined bytes: it refuses to compile a module from a byte buffer at
runtime. The helper serves the Edge pass through the `module` delivery instead. It builds the wasm, writes it to a
project-local cache (`node_modules/.cache/rust-wasmpack-loader/`, always gitignored), and imports it with the `?module`
query. Next compiles that import to a `WebAssembly.Module` ahead of time and hands the Edge runtime the ready-made
module, which instantiates without ever touching raw bytes.

The delivery is wired for you, so a `.rs` import works the same in an Edge route as anywhere else:

```javascript title="app/api/edge/route.js"
import rsLib from "../../../lib.rs";

export const runtime = "edge";

export function GET() {
    return Response.json({ result: rsLib.fibonacci(10) });
}
```

`rsLib` resolves synchronously, so the Rust exports are callable right in the handler. The same path works in middleware
and Edge API routes.

## Turbopack

Next.js 16 defaults to Turbopack, and `withRustWasm` supports it. The helper registers the loader under both
`turbopack.rules` and the `webpack` function, so the same wrapped config builds either way: `next build` runs under
Turbopack, `next build --webpack` opts back to webpack. Setting both keys is fine; Next.js only rejects a `webpack`
config under Turbopack when no `turbopack` config is present, and the helper always sets one.

Turbopack picks the loader by its rule `condition`: `browser` is the client bundle (`web` strategy, bytes inlined),
`{ not: "browser" }` is the server bundle (`node` strategy, bytes inlined), and `edge-light` is the Edge bundle (`web`
strategy, `module` delivery). The Edge rule is listed first so it wins over `{ not: "browser" }`, which also matches the
Edge environment. The same `.rs` resolves in Server Components, Client Components, and Edge routes, exactly as on
webpack.

### What is supported under Turbopack

The full feature set the helper uses: inlined bytes for the server and client passes, and the `module` delivery for
Edge. A Turbopack build behaves the same as a webpack one for `.rs` imports.

### What is blocked under Turbopack

Turbopack implements only a core subset of the webpack loader API. It does not expose `this.emitFile` or
`this._compilation`, so any delivery that emits the `.wasm` as a separate webpack asset cannot run under it:

- **`web.asyncLoading: true`** (fetch the `.wasm` at runtime) - needs `emitFile`. Blocked. The helper does not enable it.
- **`node.bundle: false`** (read the `.wasm` from disk at runtime) - emits a separate file. Blocked. The helper does not enable it.

Neither affects this helper. The Edge `module` delivery does not need `emitFile` either: the loader writes the wasm to
the project cache itself and imports it, so it runs under Turbopack's thinner loader context. If you need an
asset-emitting mode on Next, build with `--webpack` and configure the loader directly.

## Project structure

```
next-example/
├── app/
│   ├── api/
│   │   └── edge/
│   │       └── route.js    # Edge route importing the same lib.rs
│   ├── layout.js           # Root layout (App Router)
│   ├── page.js             # Server Component importing lib.rs
│   └── Result.js           # Client Component importing the same lib.rs
├── src/
│   └── index.test.js       # Helper unit test + build proof (node:test)
├── lib.rs                  # Rust WebAssembly code
├── next.config.mjs         # Next config wrapped with withRustWasm
├── Cargo.toml              # Rust configuration
└── package.json            # Dependencies and scripts
```

## Setup

### 1. Initialize the project

```bash
npx create-next-app@latest my-next-wasm-app
cd my-next-wasm-app
```

### 2. Install dependencies

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

### 4. Create the Rust code

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

### 5. Wrap the Next config

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

### 8. Import from an Edge route

```javascript title="app/api/edge/route.js"
import rsLib from "../../../lib.rs";

// Built with the `module` delivery; the wasm is a pre-compiled module the Edge
// runtime instantiates without compiling bytes.
export const runtime = "edge";

export function GET(request) {
    const n = Number(new URL(request.url).searchParams.get("n") ?? "10");
    return Response.json({ fibonacci: rsLib.fibonacci(n) });
}
```

### 9. Update package.json

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

## Running the example

```bash
# Build under Turbopack (the Next.js 16 default). Add --webpack to use webpack.
npm run build
```

## Helper options

```javascript
rustWasmLoader.next(nextConfig, {
    logLevel: "info", // "verbose" | "info" | "warn" | "error" | "quiet"
});
```

---

:::tip One `.rs`, every runtime, both bundlers
The same `import rsLib from "../lib.rs"` works from a Server Component, a Client Component, and an Edge route, and the
same wrapped config builds under Turbopack and webpack. Next builds it with the `node` strategy for the server, `web` for
the client, and the `module` delivery for Edge, so there is nothing to await on any of them.
:::

:::note Edge wasm cache
For the Edge pass the loader writes the compiled wasm to `node_modules/.cache/rust-wasmpack-loader/` and imports it with
the `?module` query, the one wasm form the Edge runtime can instantiate. The cache lives under `node_modules`, so it is
already gitignored.
:::
