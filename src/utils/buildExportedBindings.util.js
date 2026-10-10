// The glue declares each public Rust function as `export function` and each struct as
// `export class`. The raw `wasm` exports carry only mangled symbols, so both are read here.
const FUNCTION_DECL = /export function .+ {$/;
const CLASS_DECL = /export class .+ {$/;

// The patch branches append `export default {...exportedFunctions, ...}` to the module.
const BINDINGS_NAME = "exportedFunctions";

// Builds `const exportedFunctions = {...}` from the public functions and classes of the glue.
// Function names keep their source spacing, so a crate without a class emits the same bytes.
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
