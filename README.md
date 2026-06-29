[![MIT License](https://img.shields.io/npm/l/rust-wasmpack-loader.svg?)](https://npmjs.org/package/rust-wasmpack-loader)
[![View this project on NPM](https://img.shields.io/npm/v/rust-wasmpack-loader.svg)](https://npmjs.org/package/rust-wasmpack-loader)
[![View this project on NPM](https://img.shields.io/npm/dm/rust-wasmpack-loader.svg)](https://npmjs.org/package/rust-wasmpack-loader)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=yeskiy_rustwasm-loader&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=yeskiy_rustwasm-loader)
[![Known Vulnerabilities](https://snyk.io/test/github/yeskiy/rustwasm-loader/badge.svg)](https://snyk.io/test/github/yeskiy/rustwasm-loader)

# rust-wasmpack-loader

rust-wasmpack-loader compiles `.rs` (Rust) files to WebAssembly at build time and gives you back JavaScript that exposes
the Rust exports. You import a `.rs` file the way you would import any module, and the loader handles the wasm-pack
compilation and the glue code.

## Supported build tools

- [Webpack](https://webpack.js.org/) `^5.0.0` (`web` and `node`/`node-async` targets)
- [Rspack](https://rspack.rs/) `>=1.0.0` (the same Webpack-compatible loader, `web` and `node` targets)
- [Bun](https://bun.sh/) runtime (`node` target only)
- [esbuild](https://esbuild.github.io/) plugin (`node` and `web` targets, WASM inlined)
- [Rollup](https://rollupjs.org/) plugin (`node` and `web` targets, WASM inlined)
- [Vite](https://vite.dev/) plugin (SSR uses the `node` strategy, the client uses `web`, with an emitted `.wasm` asset on
  production builds)
- [Next.js](https://nextjs.org/) App Router through the `withRustWasm` helper (one `.rs` works from Server Components,
  Client Components, and Edge routes; `node` on the server and `web` on the client with bytes inlined, and a pre-compiled
  module on Edge)
- [Electron](https://www.electronjs.org/) apps with Webpack (`electron-main`/`electron-preload` use the `node` strategy,
  `electron-renderer` uses `web`, bytes inlined)

## What it does

- Import `.rs` files directly in your JavaScript or TypeScript. There is no separate build step to wire up.
- Works with `wasm_bindgen` exports and with plain functions.
- Finds the nearest `Cargo.toml` by walking up from the `.rs` file, so you do not configure the crate path by hand.
- Builds for `web` and `node` targets, and across the bundlers listed above.
- Types `.rs` imports in TypeScript: an ambient floor keeps imports valid, and generated `.d.rs.ts` sidecars (plus an editor Language Service plugin) give the exact `#[wasm_bindgen]` signatures.

You write computation-heavy code in Rust, pull in crates from the Rust ecosystem, and call the result from JavaScript
without managing a separate compile-and-link pipeline.

## Quick example

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

## Getting started

- [Installation guide](https://yeskiy.github.io/rustwasm-loader/docs/getting-started/installation)
- [Quick start tutorial](https://yeskiy.github.io/rustwasm-loader/docs/getting-started/quick-start)

## Examples

[View the examples documentation](https://yeskiy.github.io/rustwasm-loader/docs/examples).

The [example](https://github.com/yeskiy/rustwasm-loader/tree/main/example) folder in the repository shows how the loader
works across different setups:

- [Web Webpack](https://github.com/yeskiy/rustwasm-loader/tree/main/example/web-webpack) - browser applications
- [Node.js Webpack](https://github.com/yeskiy/rustwasm-loader/tree/main/example/node-webpack) - server-side applications
- [Rspack](https://github.com/yeskiy/rustwasm-loader/tree/main/example/rspack) - the Webpack-compatible loader on Rspack
- [Bun Node.js](https://github.com/yeskiy/rustwasm-loader/tree/main/example/node-bun) - the Bun runtime
- [esbuild](https://github.com/yeskiy/rustwasm-loader/tree/main/example/esbuild) - bundling for Node.js or the browser
- [Rollup](https://github.com/yeskiy/rustwasm-loader/tree/main/example/rollup) - bundling for Node.js or the browser with
  the Rollup plugin
- [Vite](https://github.com/yeskiy/rustwasm-loader/tree/main/example/vite) - SSR and client builds with the Vite plugin
- [Next.js](https://github.com/yeskiy/rustwasm-loader/tree/main/example/next) - App Router with Server and Client
  Components using the `withRustWasm` helper
- [Electron](https://github.com/yeskiy/rustwasm-loader/tree/main/example/electron) - main and renderer processes with
  Webpack

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](https://yeskiy.github.io/rustwasm-loader/contributing) for how to get
started. Bug reports, feature suggestions, documentation fixes, and pull requests all help.

## Acknowledgements

Thanks to the projects this one builds on:

- [@wasm-tool/wasm-pack-plugin](https://github.com/wasm-tool/wasm-pack-plugin) - the original inspiration for the
  WebAssembly integration
- [wasm-pack](https://github.com/rustwasm/wasm-pack) - the tool that handles the Rust-to-WASM compilation

## License

This project is licensed under the [MIT License](https://choosealicense.com/licenses/mit/).

See the [LICENSE](https://github.com/yeskiy/rustwasm-loader/blob/main/LICENSE) file for details.

## Community and support

- [Documentation](https://yeskiy.github.io/rustwasm-loader/)
- [Report issues](https://github.com/yeskiy/rustwasm-loader/issues)
- [GitHub Discussions](https://github.com/yeskiy/rustwasm-loader/discussions)
- [NPM package](https://www.npmjs.com/package/rust-wasmpack-loader)
