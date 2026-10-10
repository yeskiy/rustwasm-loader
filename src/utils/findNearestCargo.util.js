const path = require("node:path");
const jsonToToml = require("json2toml");
const fs = require("node:fs");
const { parse: tomlToJson } = require("toml");

// Walks up to the first manifest that owns the `.rs` entry. It is separate from the export,
// because the build folder name is a hash of the manifest, so the hash reads it first.
function locateCargoBy(constants) {
    function locateCargo(currentFolder, endFolder, fileEntry) {
        const tomlFile = path.join(currentFolder, constants.CARGO_TOML);
        if (fs.existsSync(tomlFile)) {
            const data = tomlToJson(
                fs.readFileSync(tomlFile, {
                    encoding: "utf8",
                }),
            );
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
            throw new Error(
                `Cannot Find "${constants.CARGO_TOML}" to create wasm`,
            );
        }
        return locateCargo(
            path.resolve(currentFolder, "../"),
            endFolder,
            fileEntry,
        );
    }
    return locateCargo;
}

module.exports = function findNearestCargoBy(constants) {
    const locateCargo = locateCargoBy(constants);

    return function findNearestCargo(
        currentFolder,
        endFolder,
        fileEntry,
        buildFolder,
    ) {
        const { folder, data } = locateCargo(
            currentFolder,
            endFolder,
            fileEntry,
        );
        const returnData = {
            [constants.CARGO_TOML]: jsonToToml(
                {
                    ...data,
                    lib: {
                        ...data.lib,
                        path: (() => {
                            const parsedFileEntry = path.parse(fileEntry);
                            const parsedBuildFolder = path.parse(buildFolder);
                            if (
                                path.join(
                                    parsedFileEntry.root,
                                    parsedFileEntry.dir
                                        .split(path.sep)
                                        .find(Boolean),
                                ) ===
                                path.join(
                                    parsedBuildFolder.root,
                                    parsedBuildFolder.dir
                                        .split(path.sep)
                                        .find(Boolean),
                                )
                            ) {
                                const fileEntryDirs = new Set(
                                    fileEntry.split(path.sep),
                                );
                                if (
                                    buildFolder
                                        .split(path.sep)
                                        .some((dir) => fileEntryDirs.has(dir))
                                ) {
                                    return path
                                        .relative(buildFolder, fileEntry)
                                        .split(path.sep)
                                        .join(path.posix.sep);
                                }
                            }

                            return fileEntry;
                        })(),
                    },
                },
                { indent: 2, newlineAfterSection: true },
            ),
        };
        const lockPath = path.join(folder, constants.CARGO_LOCK);
        if (fs.existsSync(lockPath)) {
            returnData[constants.CARGO_LOCK] = fs.readFileSync(lockPath, {
                encoding: "utf-8",
            });
        }
        return returnData;
    };
};

module.exports.locateCargoBy = locateCargoBy;
