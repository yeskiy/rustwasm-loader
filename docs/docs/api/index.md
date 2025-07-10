# API Reference

Complete reference for rust-wasmpack-loader configuration options, methods, and settings across different build tools.

## Overview

rust-wasmpack-loader provides different configuration options depending on your target environment and build tool. This
section documents all available options, their types, default values, and usage examples.

## Configuration Structure

```typescript
interface LoaderOptions {
    // Target-specific options
    web?: WebOptions;
    node?: NodeOptions;

    // Global options
    logLevel?: LogLevel;

    // Bun-specific options (when using Bun)
    // Configured via plugin API
}
```

## Quick Reference

| Option                 | Type       | Default  | Description               |
|------------------------|------------|----------|---------------------------|
| `web.asyncLoading`     | `boolean`  | `false`  | Enable async WASM loading |
| `web.publicPath`       | `boolean`  | `true`   | Use webpack public path   |
| `web.wasmPathModifier` | `string[]` | `["/"]`  | Modify WASM request path  |
| `node.bundle`          | `boolean`  | `false`  | Bundle WASM in JS file    |
| `logLevel`             | `string`   | `"info"` | Logging verbosity         |

## Target Environments

### Web Target (Browser)

Used for browser applications with Webpack:

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

### Node Target (Server)

Used for Node.js applications with Webpack:

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

### Bun Target

Used with Bun runtime:

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

## Configuration Options by Build Tool

### Webpack Options

#### Web Target Options

| Option                 | Type       | Default | Description                                       |
|------------------------|------------|---------|---------------------------------------------------|
| `web.asyncLoading`     | `boolean`  | `false` | Load WASM asynchronously instead of bundling      |
| `web.publicPath`       | `boolean`  | `true`  | Use webpack's public path for WASM files          |
| `web.wasmPathModifier` | `string[]` | `["/"]` | Modify WASM request path if wrong publicPath used |

#### Node Target Options

| Option        | Type      | Default | Description                                          |
|---------------|-----------|---------|------------------------------------------------------|
| `node.bundle` | `boolean` | `false` | Bundle WASM file in JS file (no separate .wasm file) |

#### Global Options

| Option     | Type                                                  | Default  | Description               |
|------------|-------------------------------------------------------|----------|---------------------------|
| `logLevel` | `"verbose" \| "info" \| "warn" \| "error" \| "quiet"` | `"info"` | Control logging verbosity |

### Bun Options

| Option     | Type                                                  | Default  | Description               |
|------------|-------------------------------------------------------|----------|---------------------------|
| `logLevel` | `"verbose" \| "info" \| "warn" \| "error" \| "quiet"` | `"info"` | Control logging verbosity |

## Detailed Option Reference

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

**When to use:**

- `false`: Faster initial execution, larger bundle size
- `true`: Smaller initial bundle, slightly slower first load

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

**When to use:**

- `false`: Smaller JS bundle, separate WASM file
- `true`: Single file deployment, larger JS bundle

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

### Custom Type Declarations

You can also create custom type declarations:

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