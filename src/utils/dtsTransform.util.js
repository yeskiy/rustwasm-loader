const ts = require("typescript");

// wasm-bindgen's own bootstrap export, never a user function. The default init
// (`__wbg_init`) is filtered separately via the Default modifier flag.
const SYNC_INIT_NAME = "initSync";

// A named top-level declaration the module exports, but not as its default.
function isPublicExport(node) {
    const modifiers = ts.getModifiers(node) || [];
    return (
        !!node.name &&
        modifiers.some(
            (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
        ) &&
        !modifiers.some(
            (modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword,
        )
    );
}

// Keeps only the public `#[wasm_bindgen]` functions: top-level `export function`
// declarations that are neither the default init nor wasm-bindgen's `initSync`.
function isPublicFunction(node) {
    return (
        ts.isFunctionDeclaration(node) &&
        isPublicExport(node) &&
        node.name.text !== SYNC_INIT_NAME
    );
}

// Keeps the public `#[wasm_bindgen]` structs, which wasm-bindgen declares as
// `export class`. The loader names them on the default export beside the
// functions, so they belong in the sidecar too.
function isPublicClass(node) {
    return ts.isClassDeclaration(node) && isPublicExport(node);
}

// Everything from the declaration name onward, dropping the `export function` or
// `export class` prefix and any leading JSDoc. Slicing the raw source survives
// multi-line signatures and class bodies that a regex would not.
function fromName(node, sourceFile, source) {
    return source.slice(node.name.getStart(sourceFile), node.end).trim();
}

// Renders a declaration as an object-type member. A function keeps its own
// signature. A class is named by its constructor type, so `new lib.Point(...)`
// resolves to the declared instance type.
function toMember(node, sourceFile, source) {
    if (isPublicClass(node)) {
        return `${node.name.text}: typeof ${node.name.text};`;
    }
    const text = fromName(node, sourceFile, source);
    return text.endsWith(";") ? text : `${text};`;
}

/**
 * Transforms wasm-bindgen's generated `.d.ts` into a sidecar declaration whose
 * default export matches the loader's runtime `export default {...bindings}`
 * shape. The public exported functions and classes are typed. The init
 * functions, the `InitOutput`/`InitInput` types, and raw wasm internals are
 * omitted. Each class is declared module-locally and named on the default
 * export, because the loader emits no named export to import it by. No index
 * signature, so unknown member access stays a type error.
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

    const kept = sourceFile.statements.filter(
        (node) => isPublicFunction(node) || isPublicClass(node),
    );

    return `${[
        ...kept
            .filter(isPublicClass)
            .map(
                (node) =>
                    `declare class ${fromName(node, sourceFile, wasmBindgenDts)}`,
            ),
        "declare const _default: {",
        ...kept.map(
            (node) => `    ${toMember(node, sourceFile, wasmBindgenDts)}`,
        ),
        "};",
        "export default _default;",
        "",
    ].join("\n")}`;
};
