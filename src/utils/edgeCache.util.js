const path = require("node:path");

const CACHE_SEGMENTS = ["node_modules", ".cache", "rust-wasmpack-loader"];

// Path of the wasm file of the Edge `module` delivery. The loader and the Next prebuild
// both write this file, and both get the path from this function.
module.exports = function edgeWasmPath(baseFolder, inputsHash) {
    return path.join(baseFolder, ...CACHE_SEGMENTS, `${inputsHash}.wasm`);
};

module.exports.edgeCacheDir = function edgeCacheDir(baseFolder) {
    return path.join(baseFolder, ...CACHE_SEGMENTS);
};
