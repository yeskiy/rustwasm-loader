[![MIT License](https://img.shields.io/npm/l/rust-wasmpack-loader.svg?)](https://npmjs.org/package/rust-wasmpack-loader)
[![View this project on NPM](https://img.shields.io/npm/v/rust-wasmpack-loader.svg)](https://npmjs.org/package/rust-wasmpack-loader)
[![View this project on NPM](https://img.shields.io/npm/dm/rust-wasmpack-loader.svg)](https://npmjs.org/package/rust-wasmpack-loader)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=yeskiy_rustwasm-loader&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=yeskiy_rustwasm-loader)
[![Known Vulnerabilities](https://snyk.io/test/github/yeskiy/rustwasm-loader/badge.svg)](https://snyk.io/test/github/yeskiy/rustwasm-loader)

# Welcome to rust-wasmpack-loader

**rust-wasmpack-loader** is a powerful Webpack and Bun loader that enables seamless integration of Rust resources into
your JavaScript/TypeScript projects through WebAssembly (WASM).

## What is rust-wasmpack-loader?

rust-wasmpack-loader is a native WASM loader for `.rs` (Rust) resources that works with:

- [**Webpack**](https://webpack.js.org/) `^5.0.0` (Both `web` and `node` (`node-async`) targets)
- [**Rspack**](https://rspack.rs/) `>=1.0.0` (same Webpack-compatible loader, `web` and `node` targets)
- [**Bun**](https://bun.sh/) runtime (node target only)
- [**esbuild**](https://esbuild.github.io/) plugin (`node` and `web` targets, inline WASM)
- [**Rollup**](https://rollupjs.org/) plugin (`node` and `web` targets, inline WASM)

## Key Features

🚀 **Easy Integration** — Import `.rs` files directly in your `.js` or `.ts` files without any headache

🔧 **Flexible Configuration** — Supports both `wasm_bindgen` and regular functions

📦 **Smart Discovery** — Dynamically finds the `Cargo.toml` file for building the WASM source

🌐 **Multi-Target Webpack Support** — Works with `web` and `node` applications

⚡ **Bun Compatible** — Full support for Bun runtime (node target only for now)

📦 **esbuild Plugin** — First-class esbuild plugin for `node` and `web` builds

📦 **Rollup Plugin** — First-class Rollup plugin for `node` and `web` builds

## Why Use rust-wasmpack-loader?

- **Simplicity**: The most obvious one — No complex build setups, import and use
- **Write computation-heavy code in Rust**: Leverage Rust's performance for CPU-intensive tasks
- **Ecosystem**: Access the rich Rust ecosystem from your any projects

## Quick Example

```javascript
// Import Rust code directly
import wasmModule from './fibonacci.rs';

// Use the compiled WASM module
const result = wasmModule.fibonacci(10);
console.log(result); // Output: 55
```

```rust
// fibonacci.rs
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn fibonacci(n: u32) -> u32 {
    match n {
        0 => 0,
        1 => 1,
        _ => fibonacci(n - 1) + fibonacci(n - 2),
    }
}
```

## Getting Started

Ready to boost your projects with native WebAssembly support? Let us get started!

👉 [Installation Guide](https://yeskiy.github.io/rustwasm-loader/docs/getting-started/installation)

👉 [Quick Start Tutorial](https://yeskiy.github.io/rustwasm-loader/docs/getting-started/quick-start)

## Examples

[View Examples documentation](https://yeskiy.github.io/rustwasm-loader/docs/examples)

Check the **[example](https://github.com/yeskiy/rustwasm-loader/tree/main/example)** folder in the repository for a
better understanding of how the loader works with different setups:

- **[Web Webpack](https://github.com/yeskiy/rustwasm-loader/tree/main/example/web-webpack)** - Browser applications
- **[Node.js Webpack](https://github.com/yeskiy/rustwasm-loader/tree/main/example/node-webpack)** - Server-side
  applications
- **[Rspack](https://github.com/yeskiy/rustwasm-loader/tree/main/example/rspack)** - Fast Rust-based bundling with the
  Webpack-compatible loader
- **[Bun Node.js](https://github.com/yeskiy/rustwasm-loader/tree/main/example/node-bun)** - High-performance Bun runtime
- **[esbuild](https://github.com/yeskiy/rustwasm-loader/tree/main/example/esbuild)** - Fast bundling for Node.js or the
  browser
- **[Rollup](https://github.com/yeskiy/rustwasm-loader/tree/main/example/rollup)** - Bundling for Node.js or the browser
  using the Rollup plugin

## Contributing

Contributions are always welcome!

See [CONTRIBUTING.md](https://yeskiy.github.io/rustwasm-loader/contributing) for ways to get started.

Please feel free to:

- 🐛 Report bugs and issues
- 💡 Suggest new features
- 📖 Improve documentation
- 🔧 Submit pull requests

## Acknowledgements

Special thanks to the projects that inspired and helped make rust-wasmpack-loader possible:

- [@wasm-tool/wasm-pack-plugin](https://github.com/wasm-tool/wasm-pack-plugin) - Original inspiration for WebAssembly
  integration
- [wasm-pack](https://github.com/rustwasm/wasm-pack) - The amazing tool that makes Rust-to-WASM compilation seamless

## License

This project is licensed under the [MIT License](https://choosealicense.com/licenses/mit/).

See the [LICENSE](https://github.com/yeskiy/rustwasm-loader/blob/main/LICENSE) file for details.

## Community & Support

- 📚 [Documentation](https://yeskiy.github.io/rustwasm-loader/)
- 🐛 [Report Issues](https://github.com/yeskiy/rustwasm-loader/issues)
- 💬 [GitHub Discussions](https://github.com/yeskiy/rustwasm-loader/discussions)
- 📦 [NPM Package](https://www.npmjs.com/package/rust-wasmpack-loader)

---

*Built with ❤️ by [Yehor Brodskiy](https://github.com/yeskiy)*
