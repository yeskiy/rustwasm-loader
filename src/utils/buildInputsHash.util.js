const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { locateCargoBy } = require("./findNearestCargo.util");

const constants = Object.freeze({
    CARGO_LOCK: "Cargo.lock",
    CARGO_TOML: "Cargo.toml",
});

// Stands in for a crate that carries no `Cargo.lock`. Such a crate pins no
// resolved version, so no file holds the dependency set to hash. A value that
// changes on every build would answer that with a full Rust rebuild for every
// lockless project, which costs more than the drift it would catch.
const NO_LOCK = "\u0000<no-lock>";

// Separates the fields, so a source that ends in the text of a manifest cannot
// produce the digest of another input set.
const FIELD_SEPARATOR = "\u0000";

const locateCargo = locateCargoBy(constants);

const readOr = (folder, name, fallback) =>
    fs.existsSync(path.join(folder, name))
        ? fs.readFileSync(path.join(folder, name), "utf8")
        : fallback;

const folderOf = (resourcePath, baseFolder) =>
    locateCargo(
        path.parse(path.normalize(resourcePath)).dir,
        path.normalize(baseFolder),
        path.normalize(resourcePath),
    ).folder;

/**
 * Hashes every project input that decides what a build produces: the `.rs`
 * source, and the `Cargo.toml` and `Cargo.lock` of the crate that owns it.
 *
 * The build folder and the emitted wasm are named after this digest. The source
 * alone is not enough: a dependency bump changes the wasm and the glue while the
 * source stays byte-identical, so a source-only name pairs a cached wasm of the
 * old dependency set with glue of the new one. The lock holds the resolved
 * wasm-bindgen version and every other resolved dependency. The manifest holds
 * the feature and profile settings that the lock does not carry.
 *
 * Unchanged inputs give the same digest, so an unchanged crate still reuses its
 * build folder and its cargo cache.
 * @param {string | Buffer} source the `.rs` source
 * @param {string} resourcePath absolute path to the `.rs` file
 * @param {string} baseFolder project root the manifest walk stops at
 * @returns {string} the hex digest that names the build artifacts
 * @throws {Error} when no owning `Cargo.toml` exists
 */
module.exports = function buildInputsHash(source, resourcePath, baseFolder) {
    const folder = folderOf(resourcePath, baseFolder);
    return crypto
        .createHash("sha256")
        .update(source)
        .update(FIELD_SEPARATOR)
        .update(readOr(folder, constants.CARGO_TOML, ""))
        .update(FIELD_SEPARATOR)
        .update(readOr(folder, constants.CARGO_LOCK, NO_LOCK))
        .digest("hex");
};

/**
 * Lists the cargo manifests the digest above reads, so a loader can declare them
 * as build dependencies. A bundler that knows about them rebuilds the wasm when
 * a dependency changes, instead of serving the module it cached against the
 * unchanged `.rs` source.
 * @param {string} resourcePath absolute path to the `.rs` file
 * @param {string} baseFolder project root the manifest walk stops at
 * @returns {string[]} absolute paths of the manifests that exist
 * @throws {Error} when no owning `Cargo.toml` exists
 */
module.exports.cargoManifestsFor = function cargoManifestsFor(
    resourcePath,
    baseFolder,
) {
    const folder = folderOf(resourcePath, baseFolder);
    return [constants.CARGO_TOML, constants.CARGO_LOCK]
        .map((name) => path.join(folder, name))
        .filter((file) => fs.existsSync(file));
};
