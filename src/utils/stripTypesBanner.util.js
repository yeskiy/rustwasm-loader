// wasm-bindgen writes the glue typings into a `.d.ts` next to the glue `.js`.
// From 0.2.107 it also heads the glue with a `@ts-self-types` banner that names
// that `.d.ts`, and only when the build keeps the typings. Up to 0.2.106, and
// under `--no-typescript` at any version, the glue starts with its first
// statement. The banner is always the first line. A blank line usually follows
// it, but the banner itself carries only its own newline.
const TYPES_BANNER =
    /^\/\*\s*@ts-self-types\s*=\s*"[^"]*"\s*\*\/[^\S\r\n]*\r?\n(?:\r?\n)?/;

/**
 * Cuts the wasm-bindgen `@ts-self-types` banner off the head of the generated
 * glue. The loader returns the glue alone, so the banner would name a file the
 * consumer never gets. The glue of a build that keeps the typings is then
 * identical to the glue of a build that drops them.
 * @param {string} glue the generated glue source
 * @returns {string} the glue without the banner
 */
module.exports = function stripTypesBanner(glue) {
    return glue.replace(TYPES_BANNER, "");
};
