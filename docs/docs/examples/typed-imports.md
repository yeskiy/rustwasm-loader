---
sidebar_position: 10
---

# TypeScript types

A `.rs` import can be a fully typed module in TypeScript, ESLint, and your editor. This page shows how to make `import lib from "./math.rs"` resolve, and how to get the exact signatures of your `#[wasm_bindgen]` exports.

## How it works

Types come in two layers:

- **The floor** - the package ships an ambient `declare module "*.rs"`. Once you reference it, every `.rs` import is valid and loosely typed (a record of members you can call or construct), so the import never errors even before anything is generated.
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

That alone clears the `Cannot find module './math.rs'` error. Until precise types are generated, every member of the import accepts a call and a `new`, and returns `any`.

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

#[wasm_bindgen]
pub struct Point {
    pub x: f64,
    pub y: f64,
}

#[wasm_bindgen]
impl Point {
    #[wasm_bindgen(constructor)]
    pub fn new(x: f64, y: f64) -> Point {
        Point { x, y }
    }

    pub fn norm(&self) -> f64 {
        (self.x * self.x + self.y * self.y).sqrt()
    }
}
```

```typescript title="src/index.ts"
import lib from "../math.rs";

// `lib.fibonacci` is typed `(n: number) => number`, `lib.cap` is
// `(s: string) => string`. A typo like `lib.fib()` is a compile error.
export const fib10 = lib.fibonacci(10);
export const capped = lib.cap("hello");

// `lib.Point` is the exported struct. The constructor, the `norm` method, and
// the `x` and `y` properties all carry their Rust types.
const point = new lib.Point(3, 4);
export const norm = point.norm();
```

The generated sidecar declares the class and names it on the default export:

```typescript title="math.d.rs.ts"
declare class Point {
    free(): void;
    constructor(x: number, y: number);
    norm(): number;
    x: number;
    y: number;
}
declare const _default: {
    fibonacci(n: number): number;
    cap(s: string): string;
    Point: typeof Point;
};
export default _default;
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

- **Functions and classes are both typed.** A `#[wasm_bindgen]` function gets its exact signature. A `#[wasm_bindgen]` struct reaches the default export as a class, and the sidecar declares its constructor, its methods, and its properties. An unknown member stays a compile error on either one.
- **A class has no named export.** The loader emits a default export only. The sidecar therefore declares each class beside that object, instead of exporting it. Use `InstanceType<typeof lib.Point>` when you need to name the instance type.
- **The plugin is editor-only.** `tsc` on the command line never loads a Language Service plugin, so it reads the on-disk sidecar instead. Generate it with `types: true` or the CLI for `tsc` and CI; the plugin keeps the editor live.
- **`typescript` is a dependency** of the loader (the generator and the plugin use the compiler API), so it is installed for you.
