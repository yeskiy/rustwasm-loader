// wasm-bindgen's `--target web` glue builds the wasm import object in
// `__wbg_get_imports`. Up to 0.2.104 the memory setup is a separate
// `__wbg_init_memory(imports, memory)` that the init path calls after it. From
// 0.2.105 that function is gone and `__wbg_get_imports` does the work itself.
// Both shapes define `__wbg_get_imports`.
const GET_IMPORTS_DEF = /^\s*function\s+__wbg_get_imports\s*\(/;
const INIT_MEMORY_DEF = /^\s*function\s+__wbg_init_memory\s*\(/;

/**
 * Builds the import-object setup that the synchronous init strategies run,
 * with the `__wbg_init_memory` call only on the glue versions that define it.
 * @param {string[]} lines glue source split into lines
 * @returns {string[]} the statements that leave `__wbg_imports` ready
 * @throws {Error} when the glue defines no `__wbg_get_imports`
 */
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
