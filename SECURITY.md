# Security Policy

## Supported versions

Only the latest major line gets security fixes.

| Version | Supported |
| ------- | --------- |
| 4.x     | Yes       |
| < 4.0   | No        |

Older majors get no fixes. Upgrade to the latest 4.x release first and check if the problem is still there.

## Reporting a vulnerability

Do not open a public issue for a vulnerability. Report it privately through
[GitHub private vulnerability reporting](https://github.com/yeskiy/rustwasm-loader/security/advisories/new).

A good report contains:

- the affected version of rust-wasmpack-loader
- the bundler and its version
- the operating system
- steps or a minimal project that reproduces the problem
- the impact

The project has one maintainer. The maintainer answers in the advisory thread and publishes the fixed release and the
advisory together.

## Scope

rust-wasmpack-loader runs at build time inside a bundler (Webpack, Rspack, Rollup, Vite, esbuild, Next.js, Bun). It runs
`wasm-pack` and `cargo` on the project's own `.rs` files, writes build folders under the OS temp folder, and emits
JavaScript and wasm into the bundle.

In scope, for example:

- the loader writes or reads files outside its build folders
- the loader trusts files that another local user can plant in the temp folder
- the emitted code runs something other than the compiled crate
- injection through file names or loader options

Out of scope:

- the behavior of your own Rust code, `build.rs` scripts, and cargo dependencies. They run with your rights by design.
- vulnerabilities in `wasm-pack`, `cargo`, `wasm-bindgen`, or a bundler itself. Report those to the upstream project.
