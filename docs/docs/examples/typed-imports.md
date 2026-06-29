---
sidebar_position: 10
---

# TypeScript types

A `.rs` import can be a fully typed module in TypeScript, ESLint, and your editor. This page shows how to make `import lib from "./math.rs"` resolve, and how to get the exact signatures of your `#[wasm_bindgen]` exports.

## How it works

Types come in two layers:

- **The floor** - the package ships an ambient `declare module "*.rs"`. Once you reference it, every `.rs` import is valid and loosely typed (a record of callables), so the import never errors even before anything is generated.
- **Precise sidecars** - for each `.rs`, a `<name>.d.rs.ts` file carries the exact signatures, generated from wasm-bindgen's own types. TypeScript resolves it through `allowArbitraryExtensions` and it overrides the floor for that file.

wasm-bindgen already knows the types; the loader normally discards them. The pieces below keep them and reshape them to match what a `.rs` import actually exposes at runtime.

## Make `.rs` imports valid

Reference the shipped floor from your `tsconfig.json`:

```json title="tsconfig.json"
{
    "files": ["node_modules/rust-wasmpack-loader/types/rs.d.ts"],
    "include": ["src"]
}
```

That alone clears the `Cannot find module './math.rs'` error. The import is typed as `Record<string, (...args: any[]) => any>` until precise types are generated.

## Get precise types

### 1. Turn on arbitrary-extension resolution

```json title="tsconfig.json"
{
    "compilerOptions": {
        "moduleResolution": "bundler",
        "allowArbitraryExtensions": true
    }
}
```

`allowArbitraryExtensions` (TypeScript 5.0+) is what lets `import "./math.rs"` resolve to a `math.d.rs.ts` sidecar. `moduleResolution` must be `bundler`, `node16`, or `nodenext`.

### 2. Generate the sidecars

The sidecars are generated from the Rust. Pick whichever path fits your workflow; they all produce the same `<name>.d.rs.ts` and can be combined.

#### In the editor - the Language Service plugin

Add the plugin to `tsconfig.json` and your editor types `.rs` imports live, with nothing to run:

```json title="tsconfig.json"
{
    "compilerOptions": {
        "plugins": [{ "name": "rust-wasmpack-loader/tsserver" }]
    }
}
```

The plugin loads in any tsserver-based editor (VS Code, JetBrains, Neovim) with no editor extension. In VS Code you must use the workspace TypeScript once: run **"TypeScript: Select TypeScript Version"** and choose **"Use Workspace Version"** (a `.vscode/settings.json` with `"typescript.tsdk": "node_modules/typescript/lib"` prompts for it).

Because the types come from a wasm-pack build, a freshly opened `.rs` shows the loose floor for the second or two the first build takes, then the precise types appear. Editing a `.rs` refreshes on save.

#### On build - the `types` option

Set `types: true` on the loader (or any plugin) and a normal build also writes the sidecar next to each `.rs`, reusing the build it already runs:

```javascript title="webpack.config.js"
{
    test: /\.rs$/,
    use: {
        loader: "rust-wasmpack-loader",
        options: { types: true },
    },
}
```

The same `types: true` option works on the Vite, Rollup, esbuild, and Bun plugins, and on the `withRustWasm` Next.js helper. It is off by default, so it never writes files unless you ask.

#### In CI or on demand - the CLI

The package ships a `gen-types` command that writes the sidecars for matched `.rs` files. Wire it into a typecheck or CI step:

```json title="package.json"
{
    "scripts": {
        "typecheck": "rust-wasmpack-loader gen-types && tsc --noEmit"
    }
}
```

```bash
# generate for specific files, or pass globs; --watch regenerates on change
npx rust-wasmpack-loader gen-types src/math.rs --watch
```

### 3. Ignore the generated sidecars

The sidecars are build output. Add them to `.gitignore`:

```gitignore title=".gitignore"
*.d.rs.ts
```

`tsc`, ESLint, and the editor read whatever sidecar is present; the floor covers anything not generated yet, so a fresh clone or a CI run that has not generated never errors.

## Example

The [`example/typed-imports`](https://github.com/yeskiy/rustwasm-loader/tree/main/example/typed-imports) project wires all of this together.

```rust title="math.rs"
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn fibonacci(n: i32) -> i32 {
    match n {
        0 => 0,
        1 => 1,
        _ => fibonacci(n - 1) + fibonacci(n - 2),
    }
}

#[wasm_bindgen]
pub fn cap(s: &str) -> String {
    s[0..1].to_uppercase() + &s[1..]
}
```

```typescript title="src/index.ts"
import lib from "../math.rs";

// `lib.fibonacci` is typed `(n: number) => number`, `lib.cap` is
// `(s: string) => string`. A typo like `lib.fib()` is a compile error.
export const fib10 = lib.fibonacci(10);
export const capped = lib.cap("hello");
```

```json title="tsconfig.json"
{
    "compilerOptions": {
        "module": "esnext",
        "moduleResolution": "bundler",
        "allowArbitraryExtensions": true,
        "strict": true,
        "types": [],
        "plugins": [{ "name": "rust-wasmpack-loader/tsserver" }]
    },
    "files": ["node_modules/rust-wasmpack-loader/types/rs.d.ts"],
    "include": ["src/index.ts"]
}
```

## Notes

- **Functions are typed; classes are not yet.** A `#[wasm_bindgen]` function gets its exact signature. An exported `struct`/class stays on the loose floor for now, since the loader does not yet expose wasm-bindgen classes on the default export.
- **The plugin is editor-only.** `tsc` on the command line never loads a Language Service plugin, so it reads the on-disk sidecar instead. Generate it with `types: true` or the CLI for `tsc` and CI; the plugin keeps the editor live.
- **`typescript` is a dependency** of the loader (the generator and the plugin use the compiler API), so it is installed for you.
