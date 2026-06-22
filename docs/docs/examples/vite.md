---
sidebar_position: 7
---

# Vite Example

This example demonstrates how to use rust-wasmpack-loader with [Vite](https://vite.dev/). The loader ships a
first-class Vite plugin, so you can import `.rs` files directly and the plugin compiles each one to the strategy that
matches where it runs: the `node` strategy for the server (SSR) and the `web` strategy for the client, automatically.

Because [Vite](https://vite.dev/) plugins are a superset of [Rollup](https://rollupjs.org/) plugins, the
[Rollup plugin](./rollup) also works inside Vite with a single fixed `target`. The dedicated Vite plugin shown here adds
the SSR/client split on top of that.

## How delivery is decided

The plugin chooses where the WebAssembly comes from per build:

| Build                              | Strategy | WASM delivery                                        |
|------------------------------------|----------|------------------------------------------------------|
| Client production build (`vite build`) | `web`    | Emitted as a separate `.wasm` asset and fetched at runtime |
| Client dev (`vite` / `vite serve`)     | `web`    | Inlined as bytes                                     |
| Any SSR build or dev                   | `node`   | Inlined as bytes                                     |
| `ssr.target` `webworker`/edge          | `node`   | Inlined as bytes                                     |

Only the client production build benefits from a separate asset, so that is the one case where the plugin emits one.
Everywhere else it inlines the bytes, which is always correct and needs no asset plumbing.

Server vs client is detected per module: the plugin reads `this.environment.config.consumer` on Vite 6+ and falls back
to the `options.ssr` flag on Vite 5.

## Project Structure

```
vite-example/
├── src/
│   ├── index.client.js      # Client entry (web strategy)
│   ├── index.ssr.js         # SSR entry (node strategy)
│   ├── index.test.js        # Test driving both builds with node:test
│   └── lib.rs               # Rust WebAssembly code
├── dist-client/             # Client build output
├── dist-ssr/                # SSR build output
├── vite.config.mjs          # Vite configuration wiring up the plugin
├── Cargo.toml               # Rust configuration
└── package.json             # Dependencies and scripts
```

## Setup Instructions

### 1. Initialize Project

```bash
mkdir my-vite-wasm-app
cd my-vite-wasm-app
npm init -y
```

### 2. Install Dependencies

```bash
npm install --save-dev rust-wasmpack-loader vite
```

### 3. Create Cargo.toml

```toml title="Cargo.toml"
[package]
name = "vite-wasm-example"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
wasm-bindgen = "0.2.95"
```

### 4. Create Rust Code

```rust title="src/lib.rs"
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
pub fn greet(name: &str) -> String {
    format!("Hello, {}! Greetings from Rust via Vite!", name)
}
```

### 5. Create the Entries

The same `.rs` import works in both entries; the plugin decides the strategy.

```javascript title="src/index.ssr.js"
import wasmModule from "./lib.rs";

// On the server `wasmModule` resolves synchronously (bytes are inlined).
console.log(wasmModule.greet("Vite Developer"));
console.log(`fibonacci(10) = ${wasmModule.fibonacci(10)}`);
```

```javascript title="src/index.client.js"
import wasmModule from "./lib.rs";

// In the client production build `wasmModule` is a Promise: the wasm is fetched
// from the emitted asset, so await it before use.
wasmModule.then((rs) => {
    console.log(rs.greet("Vite Developer"));
    console.log(`fibonacci(10) = ${rs.fibonacci(10)}`);
});
```

### 6. Create the Vite Config

```javascript title="vite.config.mjs"
import { defineConfig } from "vite";
import rustWasmLoader from "rust-wasmpack-loader";

export default defineConfig({
    plugins: [rustWasmLoader.vite()],
    build: {
        // Keep the emitted .wasm as a separate asset on the client build instead
        // of letting Vite inline small assets as base64.
        assetsInlineLimit: 0,
    },
});
```

### 7. Update Package.json

```json title="package.json"
{
    ...,
    "type": "module",
    "scripts": {
        "build": "vite build",
        "build:ssr": "vite build --ssr src/index.ssr.js"
    },
    ...
}
```

## Running the Example

```bash
# Client production build (emits a separate .wasm asset)
npm run build

# SSR build (inlines the wasm; run the output with node)
npm run build:ssr
```

## Plugin Options

```javascript
rustWasmLoader.vite({
    // Package name(s) shipping .rs files to keep bundled for SSR.
    ssrNoExternal: [],
    logLevel: "info", // "verbose" | "info" | "warn" | "error" | "quiet"
});
```

## Crates from `node_modules` (SSR)

When a `.rs` file lives inside an installed package, Vite externalizes that package for SSR by default and the plugin
never sees the import. Vite matches `ssr.noExternal` against the npm package name, not the file extension, so the plugin
cannot detect `.rs`-bearing dependencies on its own. Name the package through `ssrNoExternal` to keep it bundled:

```javascript
rustWasmLoader.vite({ ssrNoExternal: ["my-rust-crate-package"] });
```

The plugin merges those names into `ssr.noExternal` for you. A `.rs` file in your own source tree needs no extra
configuration.

---

:::tip SSR and client from one import
The same `import wasmModule from "./lib.rs"` compiles to the `node` strategy on the server and the `web` strategy on the
client. Remember that the client production build resolves to a Promise (the wasm is fetched), while SSR resolves
synchronously (the bytes are inlined).
:::
