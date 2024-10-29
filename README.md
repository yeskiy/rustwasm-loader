[![MIT License](https://img.shields.io/npm/l/rust-wasmpack-loader.svg?)](https://npmjs.org/package/rust-wasmpack-loader)
[![View this project on NPM](https://img.shields.io/npm/v/rust-wasmpack-loader.svg)](https://npmjs.org/package/rust-wasmpack-loader)
[![View this project on NPM](https://img.shields.io/npm/dm/rust-wasmpack-loader.svg)](https://npmjs.org/package/rust-wasmpack-loader)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=yeskiy_rustwasm-loader&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=yeskiy_rustwasm-loader)
[![Known Vulnerabilities](https://snyk.io/test/github/yeskiy/rustwasm-loader/badge.svg)](https://snyk.io/test/github/yeskiy/rustwasm-loader)

# rust-wasmpack-loader

Native wasm Webpack/Bun loader for `.rs` (Rust) resources

> Works with webpack `^5.0.0`

> Works fine with `web` and `node` (`node-async`) targets

> **NEW!** [Bun](https://bun.sh/) support (node target only)

Dynamically finds the `Cargo.toml` file for building the wasm source.
Provides the ability to use both `wasm_bindgen` and regular functions.
Allows you to use the standard import of a `.rs` file in a `.js` or `.ts` file without any headache

## Installation

> Please be sure that rust is installed on your machine. 
> If not, please install it from [the official site](https://www.rust-lang.org/tools/install)

Install `rust-wasmpack-loader` with npm

```shell script
  npm i rust-wasmpack-loader
```

Or install into Dev dependencies

```shell script
  npm i --save-dev rust-wasmpack-loader
```



## Usage
Create `Cargo.toml` file (in root or in a folder, where you want to create `.rs` file)

```toml
# Cargo.toml

[package]
name = "wasm-fibonacci-test"
version = "0.1.0"
authors = ["Yehor Brodskiy"]

[lib]
crate-type = ["cdylib"]

[dependencies]
wasm-bindgen = "0.2.95"
```

### Webpack Configuration

Add `.rs` rule to webpack config

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
### Bun Configuration

#### Basic Configuration
Add `preload.js` into bun configuration file

```toml
# bunfig.toml
preload = [
    #    ...
    "./node_modules/rust-wasmpack-loader/bun/preload.js"
    #    ...
]
```
This preload file will load default `rust-wasmpack-loader` configuration

#### Advanced Configuration
If you want to override default configuration, you can create your own `init.js` file
```js
// init.js | init.ts
import { plugin } from "bun";
import loader from "rust-wasmpack-loader";
// ...

plugin(loader.bun({
    // here you can override default configuration
}));

// ...
```
And then add it to preload
```toml
# bunfig.toml
preload = [
    #    ...
    "./path/to/init.js"
    #    ...
]
```


## Webpack Options

|              parameter |      type       | default | description                                                                 |
|-----------------------:|:---------------:|:-------:|:----------------------------------------------------------------------------|
|                  `web` |    `object`     |         | options, which used for `web` target                                        |
|                 `node` |    `object`     |         | options, which used for `node` target                                       |
|     `web.asyncLoading` |    `boolean`    | `false` | enables load `.wasm` file asynchronously, instead of bundling in .js file   |
| `web.wasmPathModifier` | `array<string>` | `["/"]` | rewrite wasm requestPath, if wrong publicPath used                          |
|       `web.publicPath` |    `boolean`    | `true`  | use webpack PublicPath                                                      |
|          `node.bundle` |    `boolean`    | `false` | Bundle `.wasm` file in `.js` file (additional `.wasm` file will not create) |
|             `logLevel` |    `string`     | `info`  | Log Level (`verbose`, `info`, `warn`, `error`, `quiet`)                     |

## Bun Options
Currently, `bun` supports only `node` target.
Built `.wasm` file will be bundled in `.js` file (since `bun` doesn't support external file watching)

|  parameter |   type   | default | description                                             |
|-----------:|:--------:|:-------:|:--------------------------------------------------------|
| `logLevel` | `string` | `info`  | Log Level (`verbose`, `info`, `warn`, `error`, `quiet`) |

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
