---
sidebar_position: 8
---

# Next.js example

This example shows how to use rust-wasmpack-loader with [Next.js](https://nextjs.org/) (App Router). The loader ships a
`withRustWasm` helper that wraps your `next.config` and wires the loader in, so you import `.rs` files from Server
Components, Client Components, and Edge routes alike. The helper picks the strategy per environment: `node` for the
server and `web` for the client, both with the WebAssembly bytes inlined, and a separate `module` delivery for the Edge
runtime. The wrapped config works under both bundlers, webpack and Turbopack. See
[Supported Next.js versions](#supported-nextjs-versions) for the command each release takes, and
[Turbopack](#turbopack) for what differs.

## Supported Next.js versions

The helper supports Next.js 14 and later. Next.js moved its Turbopack settings twice, so the helper reads the version of
the Next.js you run and writes the settings under the key that release accepts. You do not configure this.

| Next.js | Default bundler | Build with the other bundler | Turbopack settings key |
|---------|-----------------|------------------------------|------------------------|
| 14      | webpack         | not available                | `experimental.turbo`   |
| 15.0 to 15.2 | webpack    | not available                | `experimental.turbo`   |
| 15.3 to 15.5 | webpack    | `next build --turbopack`     | `turbopack`            |
| 16      | Turbopack       | `next build --webpack`       | `turbopack`            |

Two limits come from Next.js itself. Next.js 14 and Next.js 15.0 through 15.2 build with webpack only, because
`next build --turbopack` does not exist before 15.3. On those releases Turbopack runs in `next dev --turbo` alone.
Next.js 15 also has no `next build --webpack` flag, because webpack is already the default there. The flag arrived in
Next.js 16 when Turbopack became the default.

## Examples in this repository

The repository carries three Next.js examples. Each one pins a different Next.js major or a different build mode, so
both Turbopack shapes the helper writes are proved end to end.

| Directory                  | Next.js | The test builds with            | Surfaces covered                                                       |
|----------------------------|---------|---------------------------------|------------------------------------------------------------------------|
| `example/next`             | 16.x    | `--webpack` and Turbopack       | Server Component, Client Component, Edge page                          |
| `example/next15`           | 15.5.25 | webpack and `--turbopack`       | Server Component, Client Component, Edge page, Edge route handler      |
| `example/next-turbopack`   | 16.x    | Turbopack with `output: "export"` | Server Component, Client Component, static export                    |

`example/next15` is the Next.js 15 proof. Next.js 15.3 through 15.5 reads the Turbopack block at the top-level
`turbopack` key and takes the rule MAP shape, which Next.js 16 does not accept. The example asserts that shape against
the Next.js it pins, then builds and serves every surface under both bundlers.

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

The delivery is wired for you, so a `.rs` import works the same on an Edge route as anywhere else:

```javascript title="app/edge/page.js"
import rsLib from "../../lib.rs";

export const runtime = "edge";

export default function EdgePage() {
    return <p>{`fibonacci(10) = ${rsLib.fibonacci(10)}`}</p>;
}
```

`rsLib` resolves synchronously, so the Rust exports are callable right in the component. The same path works in
middleware and in Edge route handlers.

:::caution Next.js 16.3 cannot build an Edge route handler with webpack
Next.js 16.3.5 cannot build an App Router Edge route handler (an `app/**/route.js` that sets
`export const runtime = "edge"`) with `next build --webpack`. The build stops at the "Collecting page data" step with
`ENOENT ... route_client-reference-manifest.js`. This is a Next.js defect. It reproduces on a bare Next.js application
that does not use this loader, it is still present in `16.4.0-canary.36`, and Next.js 16.2.9 builds the same handler
correctly. On Next.js 16.3, Edge **pages** build under webpack and Edge route handlers build under Turbopack. Pick one
of those two, or move the route handler to the `nodejs` runtime.

Next.js 15 does not have this defect. Next.js 15.5.25 builds and serves the same Edge route handler under both webpack
and Turbopack. `example/next15` covers that route handler.
:::

## Work the helper does when the config loads

`withRustWasm` returns a value that Next.js calls. Inside that call the helper builds the Edge wasm of every `.rs` file
in your project, before the bundler starts.

This exists because Turbopack keeps a cache in `.next`. A wasm file that first appears while the build runs is absent
from that cache, so the build cannot resolve it. A change to a Rust dependency gives the file a new name, which is
exactly that case. A file that is already on disk when the build starts is read normally.

The helper hashes each `.rs` file together with the `Cargo.toml` and `Cargo.lock` of its crate. If the wasm of that
digest is already on disk, the helper does nothing. This is the usual case.

| Case | Cost |
|------|------|
| Every wasm is current | About 0.3 ms for each config load, measured on `example/next` |
| A Rust input changed | One Rust build, which the bundler pays instead when the helper does not |

The scan passes over `node_modules`, `.next`, `target` and `.git`. A `.rs` file that belongs to no crate is passed over
too, because you cannot import it either.

Use the `prebuild` option to change this behavior.

Name the files yourself, instead of a scan:

```javascript title="next.config.mjs"
import rustWasmLoader from "rust-wasmpack-loader";

export default rustWasmLoader.next({}, { prebuild: ["lib.rs"] });
```

Or switch the pre-build off, and accept that a Turbopack build after a dependency change needs a second run:

```javascript title="next.config.mjs"
import rustWasmLoader from "rust-wasmpack-loader";

export default rustWasmLoader.next({}, { prebuild: false });
```

A file you name yourself must belong to a crate. The helper reports an error that gives the path of the file.

The returned value also carries the config keys as properties, so `config.turbopack` and `config.webpack` still read
as before.

## Turbopack

`withRustWasm` supports Turbopack. The helper registers the loader under both the Turbopack rules and the `webpack`
function, so the same wrapped config builds either way. Setting both keys is fine. Next.js only rejects a `webpack`
config under Turbopack when no Turbopack config is present, and the helper always sets one.

Turbopack picks the loader per environment: the client bundle takes the `web` strategy with the bytes inlined, the
server bundle takes the `node` strategy with the bytes inlined, and the Edge bundle takes the `web` strategy with the
`module` delivery. The same `.rs` resolves in Server Components, Client Components, and Edge routes, exactly as on
webpack.

Next.js expresses that choice in two different ways, and the helper writes the one the running release reads. Next.js 16
takes a list of rules, each with its own `condition` (`edge-light`, `browser`, `{ not: "browser" }`), and the Edge rule
comes first so it wins over `{ not: "browser" }`, which also matches the Edge environment. Next.js 14 and 15 take a map
keyed by the condition name instead (`edge-light`, `browser`, `default`). The two shapes are exclusive. A Next.js 15
build that receives the list shape stops with `data did not match any variant of untagged enum RuleConfigItemOrShortcut`,
and a Next.js 16 build that receives the map shape reports an unrecognized key and then skips the loader.

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
│   ├── edge/
│   │   └── page.js         # Edge page importing the same lib.rs
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

```javascript title="app/edge/page.js"
import rsLib from "../../lib.rs";

// Built with the `module` delivery. The wasm is a pre-compiled module that the
// Edge runtime instantiates without a byte compile.
export const runtime = "edge";

export default function EdgePage() {
    return <p>{`fibonacci(10) = ${rsLib.fibonacci(10)}`}</p>;
}
```

### 9. Update package.json

The default scripts take the default bundler of your Next.js: Turbopack on Next.js 16, webpack on Next.js 14 and 15.

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

To pick the other bundler, add the flag your Next.js accepts. On Next.js 16 add `--webpack` to `dev` and `build`. On
Next.js 15.3 and later add `--turbopack`. Next.js 14 and Next.js 15.0 through 15.2 build with webpack only.

## Running the example

```bash
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
