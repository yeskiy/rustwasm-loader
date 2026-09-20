// wasm-bindgen's `--target web` glue declares each public Rust item at the top
// level: a `#[wasm_bindgen]` function becomes `export function name(...) {`, and
// a `#[wasm_bindgen]` struct becomes `export class Name {`. The raw `wasm`
// exports that the loader also spreads carry only the mangled symbols
// (`__wbg_point_free`), never the class, so both declarations are read here.
const FUNCTION_DECL = /export function .+ {$/;
const CLASS_DECL = /export class .+ {$/;

// The identifier the emitted module uses. The patch branches append
// `export default {...exportedFunctions, ...}`, so it is part of the module text.
const BINDINGS_NAME = "exportedFunctions";

/**
 * Builds the `const exportedFunctions = {...}` statement that every delivery
 * spreads into its default export, naming each public function and class the
 * glue declares. Functions keep the spacing the original harvest produced, so a
 * crate without a class emits a byte-identical module.
 * @param {string[]} lines glue source split into lines
 * @returns {string} the bindings statement
 */
module.exports = function buildExportedBindings(lines) {
    const functions = lines
        .filter((line) => FUNCTION_DECL.test(line))
        .map((line) => line.split("function")[1].split("(")[0]);
    const classes = lines
        .filter((line) => CLASS_DECL.test(line))
        .map((line) => line.split("class")[1].split("{")[0].trim());
    return `const ${BINDINGS_NAME} = {${[...functions, ...classes]
        .map((name) => `${name}:${name}`)
        .join(",")}};`;
};
