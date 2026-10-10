// wasm-bindgen up to 0.2.104 sets up memory in a separate `__wbg_init_memory`.
// From 0.2.105, `__wbg_get_imports` does this work itself.
const GET_IMPORTS_DEF = /^\s*function\s+__wbg_get_imports\s*\(/;
const INIT_MEMORY_DEF = /^\s*function\s+__wbg_init_memory\s*\(/;

// Builds the import-object setup for the synchronous init strategies.
// It calls `__wbg_init_memory` only when the glue defines that function.
module.exports = function buildGlueImports(lines) {
    if (!lines.some((line) => GET_IMPORTS_DEF.test(line))) {
        throw new Error(
            "rust-wasmpack-loader: the wasm-pack glue defines no `__wbg_get_imports`. The wasm-bindgen output format changed.",
        );
    }
    return [
        `const __wbg_imports = __wbg_get_imports();`,
        ...(lines.some((line) => INIT_MEMORY_DEF.test(line))
            ? [`__wbg_init_memory(__wbg_imports);`]
            : []),
    ];
};
