---
sidebar_position: 4
---

# esbuild Example

This example demonstrates how to use rust-wasmpack-loader with [esbuild](https://esbuild.github.io/). esbuild is an
extremely fast bundler, and the loader ships a first-class plugin so you can import `.rs` files directly from your build.

The plugin inlines the compiled WebAssembly as bytes into the generated JavaScript, so no extra asset handling is needed.
It picks the build strategy from esbuild's `platform` option: `node` builds for Node.js, while `browser`, `neutral`, and
the default target a browser-like environment.

## Project Structure

```
esbuild-example/
├── src/
│   ├── index.js          # Entry point importing the .rs module
│   └── lib.rs            # Rust WebAssembly code
├── dist/                 # Build output
├── build.mjs            # esbuild build script wiring up the plugin
├── Cargo.toml           # Rust configuration
└── package.json         # Dependencies and scripts
```

## Setup Instructions

### 1. Initialize Project

```bash
mkdir my-esbuild-wasm-app
cd my-esbuild-wasm-app
npm init -y
```

### 2. Install Dependencies

```bash
npm install --save-dev rust-wasmpack-loader esbuild
```

### 3. Create Cargo.toml

```toml title="Cargo.toml"
[package]
name = "esbuild-wasm-example"
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
    format!("Hello, {}! Greetings from Rust via esbuild!", name)
}
```

### 5. Create the Entry Point

```javascript title="src/index.js"
import wasmModule from "./lib.rs";

console.log(wasmModule.greet("esbuild Developer"));
console.log(`fibonacci(10) = ${wasmModule.fibonacci(10)}`);
```

### 6. Create the Build Script

```javascript title="build.mjs"
import * as esbuild from "esbuild";
import rustWasmLoader from "rust-wasmpack-loader";

await esbuild.build({
    entryPoints: ["src/index.js"],
    bundle: true,
    format: "esm",
    platform: "node",
    outdir: "dist",
    logLevel: "info",
    plugins: [rustWasmLoader.esbuild({ logLevel: "info" })],
});
```

For browser output, set `platform: "browser"` (or leave it unset) - the plugin will build the web strategy and inline the
WebAssembly into the bundle.

### 7. Update Package.json

```json title="package.json"
{
    ...,
    "type": "module",
    "scripts": {
        "build": "node build.mjs",
        "start": "node build.mjs && node dist/index.js"
    },
    ...
}
```

## Running the Example

```bash
# Build the bundle
npm run build

# Build and run it
npm start
```

## Plugin Options

The esbuild plugin accepts the same `logLevel` option as the other targets:

```javascript
rustWasmLoader.esbuild({
    logLevel: "info", // "verbose" | "info" | "warn" | "error" | "quiet"
});
```

---

:::tip Inline delivery
The esbuild plugin currently inlines the `.wasm` bytes into the generated JavaScript. This keeps configuration to zero -
there is no separate asset to copy or serve. Separate-asset delivery may arrive as a later enhancement.
:::
