const path = require("node:path");

// Matches an origin prefix (`https://host/` or `//host/`). The prefix stays out of
// `path.posix.join`, because the join collapses its double slash.
const ORIGIN_PREFIX = /^(?:[a-z][a-z\d+\-.]*:)?\/\//i;

// Builds the URL that the glue fetches the `.wasm` asset from. `wasmPathModifier` prefixes
// a root-relative public path only, because a public path with an origin is already absolute.
module.exports = function buildWasmUrl(wasmPathModifier, publicPath, wasmName) {
    const origin = publicPath ? ORIGIN_PREFIX.exec(publicPath)?.[0] : undefined;

    if (origin) {
        return (
            origin + path.posix.join(publicPath.slice(origin.length), wasmName)
        );
    }

    return path.posix.join(
        ...wasmPathModifier,
        ...(publicPath ? [publicPath] : []),
        wasmName,
    );
};
