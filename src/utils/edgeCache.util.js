const path = require("node:path");

const CACHE_SEGMENTS = ["node_modules", ".cache", "rust-wasmpack-loader"];

/**
 * Names the project-local file that carries the wasm of the Edge `module`
 * delivery. The loader writes it during a build, and the Next helper writes the
 * same path before the build starts. Both call this, so the two can never
 * disagree about where the file belongs.
 * @param {string} baseFolder project root the build runs against
 * @param {string} inputsHash the crate-input digest that names the file
 * @returns {string} absolute path of the cache file
 */
module.exports = function edgeWasmPath(baseFolder, inputsHash) {
    return path.join(baseFolder, ...CACHE_SEGMENTS, `${inputsHash}.wasm`);
};

module.exports.edgeCacheDir = function edgeCacheDir(baseFolder) {
    return path.join(baseFolder, ...CACHE_SEGMENTS);
};
