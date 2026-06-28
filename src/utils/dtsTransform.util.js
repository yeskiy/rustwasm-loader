const ts = require("typescript");

// wasm-bindgen's own bootstrap export, never a user function. The default init
// (`__wbg_init`) is filtered separately via the Default modifier flag.
const SYNC_INIT_NAME = "initSync";

// Keeps only the public `#[wasm_bindgen]` functions: top-level `export function`
// declarations that are neither the default init nor wasm-bindgen's `initSync`.
function isPublicFunction(node) {
    if (!ts.isFunctionDeclaration(node) || !node.name) {
        return false;
    }
    const modifiers = ts.getModifiers(node) || [];
    const isExported = modifiers.some(
        (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
    );
    const isDefault = modifiers.some(
        (modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword,
    );
    return isExported && !isDefault && node.name.text !== SYNC_INIT_NAME;
}

// Renders a function declaration as an object-type member: everything from the
// name onward (`name(params): ret;`), dropping the `export function` prefix and
// any leading JSDoc. Slicing the raw source survives multi-line signatures that
// a regex would not.
function toMember(node, sourceFile, source) {
    const text = source.slice(node.name.getStart(sourceFile), node.end).trim();
    return text.endsWith(";") ? text : `${text};`;
}

/**
 * Transforms wasm-bindgen's generated `.d.ts` into a sidecar declaration whose
 * default export matches the loader's runtime `export default {...functions}`
 * shape. Only the public exported functions are typed; classes, the init
 * functions, the `InitOutput`/`InitInput` types, and raw wasm internals are
 * omitted. No index signature, so unknown member access stays a type error.
 * @param {string} wasmBindgenDts wasm-bindgen `.d.ts` source
 * @returns {string} the sidecar module source
 */
module.exports = function dtsToSidecar(wasmBindgenDts) {
    const sourceFile = ts.createSourceFile(
        "wasm-bindgen.d.ts",
        wasmBindgenDts,
        ts.ScriptTarget.Latest,
        true,
    );

    const members = sourceFile.statements
        .filter(isPublicFunction)
        .map((node) => toMember(node, sourceFile, wasmBindgenDts));

    return `${[
        "declare const _default: {",
        ...members.map((member) => `    ${member}`),
        "};",
        "export default _default;",
        "",
    ].join("\n")}`;
};
