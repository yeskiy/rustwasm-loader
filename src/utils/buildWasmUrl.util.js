const path = require("node:path");

// A public path that carries its own origin: an absolute URL (`https://host/`)
// or a protocol-relative URL (`//host/`). `path.posix.join` collapses the double
// slash of such a prefix, so the prefix stays out of the join.
const ORIGIN_PREFIX = /^(?:[a-z][a-z\d+\-.]*:)?\/\//i;

/**
 * Builds the URL the generated glue fetches the emitted `.wasm` asset from.
 *
 * A root-relative public path resolves against the server root, and
 * `wasmPathModifier` prefixes it. An origin-carrying public path is already
 * absolute, so it needs no root prefix and the modifier does not apply to it.
 * @param {string[]} wasmPathModifier leading segments for a root-relative URL
 * @param {string} publicPath the host public path, or an empty string
 * @param {string} wasmName the emitted asset name
 * @returns {string} the runtime URL of the asset
 */
module.exports = function buildWasmUrl(wasmPathModifier, publicPath, wasmName) {
    const origin = publicPath ? ORIGIN_PREFIX.exec(publicPath)?.[0] : undefined;

    return origin
        ? origin + path.posix.join(publicPath.slice(origin.length), wasmName)
        : path.posix.join(
              ...wasmPathModifier,
              ...(publicPath ? [publicPath] : []),
              wasmName,
          );
};
