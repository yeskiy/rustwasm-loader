const path = require("node:path");
const jsonToToml = require("json2toml");
const fs = require("node:fs");
const { parse: tomlToJson } = require("toml");

const CARGO_TOML = "Cargo.toml";
const CARGO_LOCK = "Cargo.lock";

// Walks up to the first manifest that owns the `.rs` entry. It is separate from findNearestCargo,
// because the build folder name is a hash of the manifest, so the hash reads it first.
function locateCargo(currentFolder, endFolder, fileEntry) {
    const tomlFile = path.join(currentFolder, CARGO_TOML);
    if (fs.existsSync(tomlFile)) {
        const data = tomlToJson(fs.readFileSync(tomlFile, "utf8"));
        // A manifest whose `lib.path` names another file belongs to another crate.
        if (
            !data.lib.path ||
            path.normalize(path.resolve(currentFolder, data.lib.path)) ===
                fileEntry
        ) {
            return { folder: currentFolder, data };
        }
    }

    if (path.normalize(currentFolder) === endFolder) {
        throw new Error(`Cannot Find "${CARGO_TOML}" to create wasm`);
    }
    return locateCargo(
        path.resolve(currentFolder, "../"),
        endFolder,
        fileEntry,
    );
}

// The root plus the first directory of a path.
const topFolder = (file) => {
    const { root, dir } = path.parse(file);
    return path.join(root, dir.split(path.sep).find(Boolean));
};

// The entry path relative to the build folder when both share a top folder, else the absolute entry.
function libPath(fileEntry, buildFolder) {
    const fileEntryDirs = new Set(fileEntry.split(path.sep));
    return topFolder(fileEntry) === topFolder(buildFolder) &&
        buildFolder.split(path.sep).some((dir) => fileEntryDirs.has(dir))
        ? path
              .relative(buildFolder, fileEntry)
              .split(path.sep)
              .join(path.posix.sep)
        : fileEntry;
}

function findNearestCargo(currentFolder, endFolder, fileEntry, buildFolder) {
    const { folder, data } = locateCargo(currentFolder, endFolder, fileEntry);
    const lockPath = path.join(folder, CARGO_LOCK);
    return {
        [CARGO_TOML]: jsonToToml(
            {
                ...data,
                lib: { ...data.lib, path: libPath(fileEntry, buildFolder) },
            },
            { indent: 2, newlineAfterSection: true },
        ),
        ...(fs.existsSync(lockPath)
            ? { [CARGO_LOCK]: fs.readFileSync(lockPath, "utf-8") }
            : {}),
    };
}

// Writes the `Cargo.toml`, and the `Cargo.lock` when the crate has one, into the build folder.
function writeCargoFiles(buildFolder, cargoData) {
    [CARGO_TOML, ...(cargoData[CARGO_LOCK] ? [CARGO_LOCK] : [])].forEach(
        (name) =>
            fs.writeFileSync(
                path.join(buildFolder, name),
                cargoData[name],
                "utf8",
            ),
    );
}

module.exports = {
    CARGO_TOML,
    CARGO_LOCK,
    locateCargo,
    findNearestCargo,
    writeCargoFiles,
};
