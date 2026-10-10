// The glue footer is `export { initSync };` plus `export default __wbg_init;` up to 0.2.106,
// and `export { initSync, __wbg_init as default };` from 0.2.107. Both start with this list.
const FOOTER_LINE = /^\s*export\s*{[^}]*\binitSync\b/;

// Cuts the export footer off the glue, so that the loader can append its own default export.
module.exports = function stripGlueFooter(lines) {
    const footerIndex = lines.findIndex((line) => FOOTER_LINE.test(line));
    if (footerIndex === -1) {
        throw new Error(
            "rust-wasmpack-loader: the wasm-pack glue has no `export { initSync ... }` footer. The wasm-bindgen output format changed.",
        );
    }
    return lines.slice(0, footerIndex);
};
