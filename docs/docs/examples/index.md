# Examples overview

Each example here is a complete project: the setup steps, the config files, and working Rust and JavaScript you can run. Pick the one that matches your build tool.

## Web applications

- [Web Webpack](./web-webpack) - browser applications using Webpack.

## Backend and CLI applications

- [Node.js Webpack](./node-webpack) - server-side applications using Webpack.
- [Bun](./node-bun) - the Bun runtime, wired through a preload plugin.
- [esbuild](./esbuild) - fast bundling for Node.js or the browser using the esbuild plugin.
- [Rspack](./rspack) - Rust-based bundling with the Webpack-compatible loader, unchanged.
- [Rollup](./rollup) - bundling for Node.js or the browser using the Rollup plugin.
- [Vite](./vite) - SSR and client builds using the Vite plugin (the `node` strategy for the server, `web` for the client).

## Full-stack frameworks

- [Next.js](./next) - App Router with the `withRustWasm` helper. The same `.rs` works from Server and Client Components (the `node` strategy for the server, `web` for the client), under both Turbopack and webpack.
