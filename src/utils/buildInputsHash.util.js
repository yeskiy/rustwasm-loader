const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { CARGO_TOML, CARGO_LOCK } = require("./findNearestCargo.util");
const { cargoInputsFor } = require("./cargoManifest.util");
const { recordedSources } = require("./rustSources.util");
const { manifestFolderFor } = require("./cargoTarget.util");

// Stands in for a missing `Cargo.lock`. The value is constant, because a value that changes
// on every build would force a full Rust rebuild of each crate without a lock.
const NO_LOCK = "\u0000<no-lock>";

// Separates the fields, so a source that ends in the text of a manifest cannot
// produce the digest of another input set.
const FIELD_SEPARATOR = "\u0000";

// Stands in for a recorded module file that does not exist.
const MISSING_FILE = "\u0000<missing>";

const readOr = (folder, name, fallback) =>
    fs.existsSync(path.join(folder, name))
        ? fs.readFileSync(path.join(folder, name), "utf8")
        : fallback;

const readFile = (file) =>
    fs.existsSync(file) ? fs.readFileSync(file) : MISSING_FILE;

// Hashes the `.rs` entry, its recorded module files, the crate `Cargo.toml`, the lock it builds
// against, and the manifests of its workspace root and local path dependencies.
module.exports = function buildInputsHash(source, resourcePath, baseFolder) {
    const folder = manifestFolderFor(resourcePath, baseFolder);
    const { lock, manifests } = cargoInputsFor(folder);
    return recordedSources(resourcePath)
        .reduce(
            (hash, file) =>
                hash
                    .update(FIELD_SEPARATOR)
                    .update(file)
                    .update(FIELD_SEPARATOR)
                    .update(readFile(file)),
            manifests.reduce(
                (hash, file) =>
                    hash.update(FIELD_SEPARATOR).update(readFile(file)),
                crypto
                    .createHash("sha256")
                    .update(source)
                    .update(FIELD_SEPARATOR)
                    .update(readOr(folder, CARGO_TOML, ""))
                    .update(FIELD_SEPARATOR)
                    .update(readOr(path.dirname(lock), CARGO_LOCK, NO_LOCK)),
            ),
        )
        .digest("hex");
};

// Lists the cargo files that the digest reads. A loader declares them as build dependencies,
// so that a dependency change rebuilds the wasm.
module.exports.cargoManifestsFor = function cargoManifestsFor(
    resourcePath,
    baseFolder,
) {
    const folder = manifestFolderFor(resourcePath, baseFolder);
    const { lock, manifests } = cargoInputsFor(folder);
    return [path.join(folder, CARGO_TOML), lock, ...manifests].filter((file) =>
        fs.existsSync(file),
    );
};

// Lists the files to watch for an entry: the module files of the last build and the manifests.
module.exports.watchFilesFor = (resourcePath, baseFolder) => [
    ...recordedSources(resourcePath),
    ...module.exports.cargoManifestsFor(resourcePath, baseFolder),
];
