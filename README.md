[![MIT License](https://img.shields.io/apm/l/atomic-design-ui.svg?)](https://github.com/tterb/atomic-design-ui/blob/master/LICENSEs)
[![View this project on NPM](https://img.shields.io/npm/v/rust-wasmpack-loader.svg)](https://npmjs.org/package/rust-wasmpack-loader)
[![View this project on NPM](https://img.shields.io/npm/dm/rust-wasmpack-loader.svg)](https://npmjs.org/package/rust-wasmpack-loader)
[![Known Vulnerabilities](https://snyk.io/test/github/yeskiy/rustwasm-loader/badge.svg)](https://snyk.io/test/github/yeskiy/rustwasm-loader)

# Rust Wasm-pack Loader

Native wasm Webpack loader for `.rs` (Rust) resources

> Works with webpack `^5.0.0`

Dynamically finds the `Cargo.toml` file for building the wasm source.
Provides the ability to use both wasm_bindgen and regular functions.
Allows you to use the standard import of a `.rs` file in a `.js` or `.ts` file without any headache

## Installation

Install `rust-wasmpack-loader` with npm

```shell script
  npm i rust-wasmpack-loader
```

Or install into Dev dependencies

```shell script
  npm i --save-dev rust-wasmpack-loader
```

## Usage

Add .rs rule to webpack config

```js 
// webpack.config.js

module.exports = {
    // ...
    module: {
        // ...
        rules: [
            // ...
            {
                test: /\.rs$/,
                exclude: /node_modules/,
                use: [
                    {
                        loader: "rust-wasmpack-loader",
                    },
                ],
            },
        ]
    }
}
```

Also, create `Cargo.toml` file (in root or in folder, where you want to create `.rs` file)

```toml
# Cargo.toml

[package]
name = "wasm-fibonacci-test"
version = "0.1.0"
authors = ["Yehor Brodskiy"]

[lib]
crate-type = ["cdylib"]

[dependencies]
wasm-bindgen = "0.2.73"
```

## Examples
Check the **[example](./example)** folder for a better understanding of how the loader works

## Contributing

Contributions are always welcome!

See [CONTRIBUTING.md](./CONTRIBUTING.md) for ways to get started.

## Acknowledgements

- [@wasm-tool/wasm-pack-plugin](https://github.com/wasm-tool/wasm-pack-plugin)
- [wasm-pack](https://github.com/rustwasm/wasm-pack)

## License

[MIT](https://choosealicense.com/licenses/mit/)
