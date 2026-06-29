# Examples overview

Each example here is a complete project: the setup steps, the config files, and working Rust and JavaScript you can run. Pick the one that matches your build tool.

## Web applications

- [Web Webpack](./web-webpack.md) - browser applications using Webpack.

## Backend and CLI applications

- [Node.js Webpack](./node-webpack.md) - server-side applications using Webpack.
- [Bun](./node-bun.md) - the Bun runtime, wired through a preload plugin.
- [esbuild](./esbuild.md) - fast bundling for Node.js or the browser using the esbuild plugin.
- [Rspack](./rspack.md) - Rust-based bundling with the Webpack-compatible loader, unchanged.
- [Rollup](./rollup.md) - bundling for Node.js or the browser using the Rollup plugin.
- [Vite](./vite.md) - SSR and client builds using the Vite plugin (the `node` strategy for the server, `web` for the client).

## Full-stack frameworks

- [Next.js](./next.md) - App Router with the `withRustWasm` helper. The same `.rs` works from Server Components, Client Components, and Edge routes (the `node` strategy for the server, `web` for the client, and a pre-compiled module on Edge), under both Turbopack and webpack.

## Desktop applications

- [Electron](./electron.md) - main and renderer processes with Webpack (`electron-main` uses the `node` strategy, `electron-renderer` uses `web`), with the wasm bytes inlined into both.

## TypeScript

- [TypeScript types](./typed-imports.md) - type `.rs` imports with the ambient floor, the `gen-types` CLI, the build-time `types` option, and the editor Language Service plugin.
