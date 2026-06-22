---
sidebar_position: 5
---

# Rspack Example

This example demonstrates how to use rust-wasmpack-loader with [Rspack](https://rspack.rs/). Rspack is a fast Rust-based
bundler that mirrors the Webpack API, so the same loader you use with Webpack works here without any changes.

Because Rspack reuses the Webpack loader context, you configure the `.rs` rule exactly as you would for Webpack. This
example targets Node.js and inlines the compiled WebAssembly into the bundle via the `node.bundle` option.

## Project Structure

```
rspack-example/
├── src/
│   ├── index.js              # Entry point importing the .rs module
│   ├── index.test.js         # Test entry using node:test
│   └── lib.rs                # Rust WebAssembly code
├── dist/                     # Build output
├── Cargo.toml                # Rust configuration
├── package.json              # Dependencies and scripts
├── rspack.config.js          # Rspack configuration
└── test.rspack.config.js     # Test configuration
```

## Setup Instructions

### 1. Initialize Project

```bash
mkdir my-rspack-wasm-app
cd my-rspack-wasm-app
npm init -y
```

### 2. Install Dependencies

```bash
npm install --save-dev rust-wasmpack-loader @rspack/core @rspack/cli webpack-node-externals
```

### 3. Create Cargo.toml

```toml title="Cargo.toml"
[package]
name = "rspack-wasm-example"
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

#[no_mangle]
pub fn fibonacci_default(n: i32) -> i32 {
    match n {
        0 => 0,
        1 => 1,
        _ => fibonacci_default(n - 1) + fibonacci_default(n - 2),
    }
}

#[wasm_bindgen]
pub fn fibonacci_bindgen(n: i32) -> i32 {
    match n {
        0 => 0,
        1 => 1,
        _ => fibonacci_bindgen(n - 1) + fibonacci_bindgen(n - 2),
    }
}

#[wasm_bindgen]
pub fn cap(s: &str) -> String {
    s[0..1].to_uppercase() + &s[1..]
}
```

### 5. Create the Entry Point

```javascript title="src/index.js"
import rsLib from "./lib.rs";

const NUM = 10;

console.log(`fibonacci_bindgen(${NUM}) = ${rsLib.fibonacci_bindgen(NUM)}`);
console.log(`fibonacci_default(${NUM}) = ${rsLib.fibonacci_default(NUM)}`);
console.log(`cap("hello") = ${rsLib.cap("hello")}`);
```

### 6. Configure Rspack

```javascript title="rspack.config.js"
const path = require("path");
const nodeExternals = require("webpack-node-externals");

module.exports = {
    mode: "development",
    entry: "./src/index.js",
    output: {
        path: path.resolve(__dirname, "dist"),
        filename: "bundle.js",
        clean: true,
    },
    target: "node",
    node: false,
    externals: nodeExternals(),
    module: {
        rules: [
            {
                test: /\.rs$/,
                exclude: /node_modules/,
                use: [
                    {
                        loader: "rust-wasmpack-loader",
                        options: {
                            node: {
                                bundle: true,
                            },
                            logLevel: "info",
                        },
                    },
                ],
            },
        ],
    },
    resolve: {
        extensions: [".js", ".ts"],
    },
    experiments: {
        syncWebAssembly: true,
        asyncWebAssembly: false,
    },
};
```

With `node.bundle` set to `true`, the WebAssembly bytes are inlined into the generated JavaScript, so Rspack's built-in
`webassembly/async` rule never has to handle a separate `.wasm` asset. That is why `asyncWebAssembly` is disabled and
`syncWebAssembly` is enabled here.

### 7. Update Package.json

```json title="package.json"
{
    ...,
    "scripts": {
        "build": "rspack build --config rspack.config.js",
        "start": "rspack build --config rspack.config.js --watch",
        "test": "rspack build --config test.rspack.config.js && node --test dist/comp.test.js"
    },
    ...
}
```

## Running the Example

```bash
# Build the bundle
npm run build

# Run the built application
node dist/bundle.js
```

## Testing

The test entry reuses the build config and swaps the entry point, then runs the bundled output through Node's built-in
test runner.

```javascript title="src/index.test.js"
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import rsLib from "./lib.rs";

describe("rspack", () => {
    test("fibonacci_bindgen", () => {
        assert.equal(rsLib.fibonacci_bindgen(10), 55);
    });

    test("fibonacci_default", () => {
        assert.equal(rsLib.fibonacci_default(10), 55);
    });

    test("cap", () => {
        assert.equal(rsLib.cap("hello"), "Hello");
    });
});
```

```javascript title="test.rspack.config.js"
const common = require("./rspack.config");

common.entry = "./src/index.test.js";
common.output.filename = "comp.test.js";
module.exports = common;
```

```bash
npm test
```

---

:::tip Drop-in Webpack replacement
Rspack mirrors the Webpack loader API, so the loader configuration is identical. If you already use rust-wasmpack-loader
with Webpack, switching to Rspack needs no loader changes.
:::
