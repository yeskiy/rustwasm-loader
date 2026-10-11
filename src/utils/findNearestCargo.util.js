const path = require("node:path");
const fs = require("node:fs");
const { stringify } = require("smol-toml");
const {
    CARGO_TOML,
    CARGO_LOCK,
    readManifest,
    resolveManifest,
} = require("./cargoManifest.util");

// Walks up to the first manifest that owns the `.rs` entry. It is separate from findNearestCargo,
// because the build folder name is a hash of the manifest, so the hash reads it first.
function locateCargo(currentFolder, endFolder, fileEntry) {
    if (fs.existsSync(path.join(currentFolder, CARGO_TOML))) {
        const data = readManifest(currentFolder);
        // A manifest without a package, or whose `lib.path` names another file, owns no entry here.
        if (
            data.package &&
            (!data.lib?.path ||
                path.normalize(path.resolve(currentFolder, data.lib.path)) ===
                    fileEntry)
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

// The `Cargo.toml` for the build folder, and the `Cargo.lock` of the crate or of its workspace.
function findNearestCargo(currentFolder, endFolder, fileEntry, buildFolder) {
    const { folder } = locateCargo(currentFolder, endFolder, fileEntry);
    const { manifest, rootFolder } = resolveManifest(folder);
    const lock = path.join(rootFolder ?? folder, CARGO_LOCK);
    return {
        [CARGO_TOML]: stringify({
            ...manifest,
            lib: { ...manifest.lib, path: libPath(fileEntry, buildFolder) },
        }),
        ...(fs.existsSync(lock)
            ? { [CARGO_LOCK]: fs.readFileSync(lock, "utf-8") }
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
