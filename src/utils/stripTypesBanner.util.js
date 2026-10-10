// From 0.2.107, a build that keeps typings starts the glue with a `@ts-self-types` banner line.
// The pattern also removes one optional blank line after the banner.
const TYPES_BANNER =
    /^\/\*\s*@ts-self-types\s*=\s*"[^"]*"\s*\*\/[^\S\r\n]*\r?\n(?:\r?\n)?/;

// The banner names a `.d.ts` that the consumer never gets. Without it, the glue of a build
// that keeps typings is identical to the glue of a build that drops them.
module.exports = function stripTypesBanner(glue) {
    return glue.replace(TYPES_BANNER, "");
};
