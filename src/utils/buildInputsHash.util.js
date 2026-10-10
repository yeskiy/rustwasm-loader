const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { locateCargoBy } = require("./findNearestCargo.util");
const { recordedSources } = require("./rustSources.util");

const constants = Object.freeze({
    CARGO_LOCK: "Cargo.lock",
    CARGO_TOML: "Cargo.toml",
});

// Stands in for a missing `Cargo.lock`. The value is constant, because a value that changes
// on every build would force a full Rust rebuild of each crate without a lock.
const NO_LOCK = "\u0000<no-lock>";

// Separates the fields, so a source that ends in the text of a manifest cannot
// produce the digest of another input set.
const FIELD_SEPARATOR = "\u0000";

// Stands in for a recorded module file that does not exist.
const MISSING_FILE = "\u0000<missing>";

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

// Hashes the `.rs` entry, its recorded module files, and the crate `Cargo.toml` and `Cargo.lock`.
// The digest names the build folder and the wasm, because a dependency change alters both.
module.exports = function buildInputsHash(source, resourcePath, baseFolder) {
    const folder = folderOf(resourcePath, baseFolder);
    return recordedSources(resourcePath)
        .reduce(
            (hash, file) =>
                hash
                    .update(FIELD_SEPARATOR)
                    .update(file)
                    .update(FIELD_SEPARATOR)
                    .update(
                        fs.existsSync(file)
                            ? fs.readFileSync(file)
                            : MISSING_FILE,
                    ),
            crypto
                .createHash("sha256")
                .update(source)
                .update(FIELD_SEPARATOR)
                .update(readOr(folder, constants.CARGO_TOML, ""))
                .update(FIELD_SEPARATOR)
                .update(readOr(folder, constants.CARGO_LOCK, NO_LOCK)),
        )
        .digest("hex");
};

// Lists the cargo manifests that the digest reads. A loader declares them as build dependencies,
// so that a dependency change rebuilds the wasm.
module.exports.cargoManifestsFor = function cargoManifestsFor(
    resourcePath,
    baseFolder,
) {
    const folder = folderOf(resourcePath, baseFolder);
    return [constants.CARGO_TOML, constants.CARGO_LOCK]
        .map((name) => path.join(folder, name))
        .filter((file) => fs.existsSync(file));
};

// Lists the files to watch for an entry: the module files of the last build and the manifests.
module.exports.watchFilesFor = (resourcePath, baseFolder) => [
    ...recordedSources(resourcePath),
    ...module.exports.cargoManifestsFor(resourcePath, baseFolder),
];
