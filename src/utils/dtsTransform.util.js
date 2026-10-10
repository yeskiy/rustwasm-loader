const ts = require("typescript");

// The wasm-bindgen bootstrap export, never a user function. `isPublicExport` drops the
// default init (`__wbg_init`) through its Default modifier.
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

// Keeps the public `#[wasm_bindgen]` structs, which the glue declares as `export class`.
// The loader puts them on the default export, so the sidecar types them too.
function isPublicClass(node) {
    return ts.isClassDeclaration(node) && isPublicExport(node);
}

// The source from the declaration name onward, without the `export` prefix and JSDoc.
// A slice of the source keeps multi-line signatures and class bodies intact.
function fromName(node, sourceFile, source) {
    return source.slice(node.name.getStart(sourceFile), node.end).trim();
}

// Renders a declaration as an object-type member. A class gets its constructor type,
// so that `new lib.Point(...)` resolves to the declared instance type.
function toMember(node, sourceFile, source) {
    if (isPublicClass(node)) {
        return `${node.name.text}: typeof ${node.name.text};`;
    }
    const text = fromName(node, sourceFile, source);
    return text.endsWith(";") ? text : `${text};`;
}

// Turns the wasm-bindgen `.d.ts` into a sidecar that types the default export of the loader.
// Classes are module-local, and no index signature exists, so an unknown member is a type error.
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

    return [
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
    ].join("\n");
};
