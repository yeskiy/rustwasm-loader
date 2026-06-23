---
sidebar_position: 6
---

# Rollup example

This example shows how to use rust-wasmpack-loader with [Rollup](https://rollupjs.org/). The loader ships a Rollup
plugin, so you import `.rs` files directly from your bundle.

The plugin inlines the compiled WebAssembly as bytes into the generated JavaScript, so there is no extra asset to handle.
Rollup has no platform concept of its own, so you choose the build strategy through the plugin's `target` option: `web`
(the default) or `node`. This example targets Node.js.

Because [Vite](https://vite.dev/) plugins are a superset of Rollup plugins, the same plugin works inside a Vite config.

## Project structure

```
rollup-example/
├── src/
│   ├── index.js              # Entry point importing the .rs module
│   ├── index.test.js         # Test entry using node:test
│   └── lib.rs                # Rust WebAssembly code
├── dist/                     # Build output
├── rollup.config.mjs         # Rollup configuration wiring up the plugin
├── Cargo.toml                # Rust configuration
└── package.json              # Dependencies and scripts
```

## Setup

### 1. Initialize the project

```bash
mkdir my-rollup-wasm-app
cd my-rollup-wasm-app
npm init -y
```

### 2. Install dependencies

```bash
npm install --save-dev rust-wasmpack-loader rollup
```

### 3. Create Cargo.toml

```toml title="Cargo.toml"
[package]
name = "rollup-wasm-example"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
wasm-bindgen = "0.2.95"
```

### 4. Create the Rust code

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
    format!("Hello, {}! Greetings from Rust via Rollup!", name)
}
```

### 5. Create the entry point

Import the `.rs` file like any other module and call its exports.

```javascript title="src/index.js"
import wasmModule from "./lib.rs";

console.log(wasmModule.greet("Rollup Developer"));
console.log(`fibonacci(10) = ${wasmModule.fibonacci(10)}`);
```

### 6. Create the Rollup config

```javascript title="rollup.config.mjs"
import rustWasmLoader from "rust-wasmpack-loader";

export default {
    input: "src/index.js",
    output: {
        dir: "dist",
        format: "esm",
    },
    external: (id) => id.startsWith("node:"),
    plugins: [rustWasmLoader.rollup({ target: "node", logLevel: "info" })],
};
```

For browser output, set `target: "web"` (the default). The plugin then builds the web strategy and inlines the
WebAssembly into the bundle.

### 7. Update package.json

```json title="package.json"
{
    ...,
    "type": "module",
    "scripts": {
        "build": "rollup -c rollup.config.mjs",
        "start": "rollup -c rollup.config.mjs && node dist/index.js"
    },
    ...
}
```

## Running the example

```bash
# Build the bundle
npm run build

# Build and run it
npm start
```

## Plugin options

The Rollup plugin accepts a `target` (since Rollup has no platform of its own) plus the shared `logLevel` option:

```javascript
rustWasmLoader.rollup({
    target: "web", // "web" | "node" (default "web")
    logLevel: "info", // "verbose" | "info" | "warn" | "error" | "quiet"
});
```

## Using it with Vite

Vite builds on Rollup, so this plugin works inside a Vite config. For Vite,
prefer the dedicated `rustWasmLoader.vite` plugin: it picks the `node` strategy
for SSR and the `web` strategy for the client automatically, where this Rollup
plugin uses a single fixed `target`. See the [Vite example](./vite) for the
full setup.

```javascript title="vite.config.mjs"
import { defineConfig } from "vite";
import rustWasmLoader from "rust-wasmpack-loader";

export default defineConfig({
    plugins: [rustWasmLoader.vite()],
});
```

---

:::tip Inline delivery
The Rollup plugin currently inlines the `.wasm` bytes into the generated JavaScript, so there is no separate asset to
copy or serve and no extra configuration. Separate-asset delivery may arrive as a later enhancement.
:::
