// wasm-bindgen closes its `--target web` glue with an export footer. Up to
// 0.2.106 the footer is `export { initSync };` plus `export default __wbg_init;`.
// From 0.2.107 the two lines are merged into
// `export { initSync, __wbg_init as default };`. Both shapes start with an
// `export {` list that names `initSync`.
const FOOTER_LINE = /^\s*export\s*{[^}]*\binitSync\b/;

/**
 * Cuts the wasm-bindgen export footer off the generated glue, so the loader can
 * append its own default export without a duplicate.
 * @param {string[]} lines glue source split into lines
 * @returns {string[]} the lines before the footer
 * @throws {Error} when the glue holds no footer
 */
module.exports = function stripGlueFooter(lines) {
    const footerIndex = lines.findIndex((line) => FOOTER_LINE.test(line));
    if (footerIndex === -1) {
        throw new Error(
            "rust-wasmpack-loader: the wasm-pack glue has no `export { initSync ... }` footer. The wasm-bindgen output format changed.",
        );
    }
    return lines.slice(0, footerIndex);
};
