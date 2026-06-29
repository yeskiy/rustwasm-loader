# API reference

This page documents the configuration options for rust-wasmpack-loader across the supported build tools, with their
types, defaults, and usage. The available options depend on your target environment and build tool.

## Configuration structure

```typescript
interface LoaderOptions {
    // Override webpack's target ("web" or "node")
    target?: "web" | "node";

    // Target-specific options
    web?: WebOptions;
    node?: NodeOptions;

    // Global options
    logLevel?: LogLevel;

    // Bun-specific options (when using Bun)
    // Configured via plugin API
}
```

## Quick reference

| Option                 | Type       | Default        | Description                 |
|------------------------|------------|----------------|-----------------------------|
| `target`               | `string`   | webpack target | Override the build target   |
| `web.asyncLoading`     | `boolean`  | `false`        | Enable async WASM loading   |
| `web.publicPath`       | `boolean`  | `true`         | Use webpack public path     |
| `web.wasmPathModifier` | `string[]` | `["/"]`        | Modify WASM request path    |
| `node.bundle`          | `boolean`  | `false`        | Bundle WASM in JS file      |
| `logLevel`             | `string`   | `"info"`       | Logging verbosity           |
| `types`                | `boolean`  | `false`        | Write `.d.rs.ts` type sidecars on build |

## Target environments

### Web target (browser)

For browser applications with Webpack:

```javascript title="webpack.config.js"
module.exports = {
    target: 'web',
    module: {
        rules: [
            {
                test: /\.rs$/,
                use: {
                    loader: "rust-wasmpack-loader",
                    options: {
                        web: {
                            asyncLoading: false,
                            publicPath: true,
                            wasmPathModifier: ["/"]
                        },
                        logLevel: "info"
                    }
                }
            }
        ]
    }
};
```

### Node target (server)

For Node.js applications with Webpack:

```javascript title="webpack.config.js"
module.exports = {
    target: 'async-node',
    module: {
        rules: [
            {
                test: /\.rs$/,
                use: {
                    loader: "rust-wasmpack-loader",
                    options: {
                        node: {
                            bundle: true
                        },
                        logLevel: "info"
                    }
                }
            }
        ]
    }
};
```

### Bun target

For the Bun runtime:

```toml title="bunfig.toml"
preload = ["./node_modules/rust-wasmpack-loader/bun/preload.js"]
```

```javascript title="custom-bun-init.js"
import { plugin } from "bun";
import loader from "rust-wasmpack-loader";

plugin(loader.bun({
    logLevel: "info"
}));
```

## Configuration options by build tool

### Webpack options

#### Web target options

| Option                 | Type       | Default | Description                                       |
|------------------------|------------|---------|---------------------------------------------------|
| `web.asyncLoading`     | `boolean`  | `false` | Load WASM asynchronously instead of bundling      |
| `web.publicPath`       | `boolean`  | `true`  | Use webpack's public path for WASM files          |
| `web.wasmPathModifier` | `string[]` | `["/"]` | Modify WASM request path if wrong publicPath used |

#### Node target options

| Option        | Type      | Default | Description                                          |
|---------------|-----------|---------|------------------------------------------------------|
| `node.bundle` | `boolean` | `false` | Bundle WASM file in JS file (no separate .wasm file) |

#### Global options

| Option     | Type                                                  | Default          | Description                    |
|------------|-------------------------------------------------------|------------------|--------------------------------|
| `target`   | `"web" \| "node"`                                     | webpack `target` | Override the build target      |
| `logLevel` | `"verbose" \| "info" \| "warn" \| "error" \| "quiet"` | `"info"`         | Control logging verbosity      |
| `types`    | `boolean`                                             | `false`          | Also write the `<name>.d.rs.ts` type sidecar during the build |

`types` is available on every surface (the loader, the Vite/Rollup/esbuild/Bun plugins, and the Next.js helper). It is one of three ways to generate the type sidecars, alongside the `gen-types` CLI and the editor Language Service plugin. See [TypeScript types](../examples/typed-imports.md) for the full setup.

### Bun options

| Option     | Type                                                  | Default  | Description               |
|------------|-------------------------------------------------------|----------|---------------------------|
| `logLevel` | `"verbose" \| "info" \| "warn" \| "error" \| "quiet"` | `"info"` | Control logging verbosity |

## Detailed option reference

### `target`

**Type:** `"web" | "node"`  
**Default:** webpack's `target`  
**Target:** Webpack

Overrides the build target the loader derives from webpack's own `target`. Set it when webpack's target does not map
cleanly to `web` or `node`, or when a single config compiles `.rs` files for a different environment than the rest of the
build. When omitted, the loader uses webpack's `target`.

```javascript
{
    // Force the node build strategy regardless of webpack's target
    target: "node",
    node: {
        bundle: true
    }
}
```

### `web.asyncLoading`

**Type:** `boolean`  
**Default:** `false`  
**Target:** Web only

Controls how WebAssembly modules are loaded in the browser.

```javascript
// Sync loading (default) - WASM is bundled with JS
{
    web: {
        asyncLoading: false
    }
}

// Async loading - WASM is loaded separately
{
    web: {
        asyncLoading: true
    }
}
```

Set `false` for faster initial execution at the cost of a larger bundle. Set `true` for a smaller initial bundle and a
slightly slower first load.

### `web.publicPath`

**Type:** `boolean`  
**Default:** `true`  
**Target:** Web only

Whether to use webpack's public path for WASM file URLs.

```javascript
// Use webpack public path (default)
{
    web: {
        publicPath: true
    }
}

// Don't use webpack public path
{
    web: {
        publicPath: false
    }
}
```

### `web.wasmPathModifier`

**Type:** `string[]`  
**Default:** `["/"]`  
**Target:** Web only

Modify the WASM request path when the public path is incorrect.

```javascript
// Default - no modification
{
    web: {
        wasmPathModifier: ["/"]
    }
}

// Custom path modification
{
    web: {
        wasmPathModifier: ["/assets/", "/static/"]
    }
}
```

### `node.bundle`

**Type:** `boolean`  
**Default:** `false`  
**Target:** Node only

Whether to bundle the WASM file inside the JavaScript bundle.

```javascript
// Separate WASM file (default)
{
    node: {
        bundle: false
    }
}

// Bundle WASM in JS file
{
    node: {
        bundle: true
    }
}
```

Set `false` for a smaller JS bundle with a separate WASM file. Set `true` to deploy a single file at the cost of a larger
JS bundle.

### `logLevel`

**Type:** `"verbose" | "info" | "warn" | "error" | "quiet"`  
**Default:** `"info"`  
**Target:** All

Controls the verbosity of loader output.

```javascript
{
    logLevel: "verbose"  // Maximum logging
}
{
    logLevel: "info"     // Standard logging (default)
}
{
    logLevel: "warn"     // Warnings and errors only
}
{
    logLevel: "error"    // Errors only
}
{
    logLevel: "quiet"    // No logging
}
```

### Custom type declarations

You can declare the module type yourself to get typed exports:

```typescript title="src/types.d.ts"
declare module "*.rs" {
    export function greet(name: string): string;

    export function fibonacci(n: number): number;

    export function process_data(data: Uint8Array): Uint8Array;

    const wasmModule: Promise<{
        greet: typeof greet;
        fibonacci: typeof fibonacci;
        process_data: typeof process_data;
    }>;

    export default wasmModule;
}
```