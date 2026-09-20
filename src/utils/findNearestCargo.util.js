const path = require("node:path");
const jsonToToml = require("json2toml");
const fs = require("node:fs");
const { parse: tomlToJson } = require("toml");

/**
 * Walks up from the folder of the `.rs` entry toward the base folder and stops
 * at the first manifest that owns that entry. A manifest whose `lib.path` names
 * a different file belongs to another crate, so the walk steps over it.
 *
 * The walk is the discovery half of {@link module.exports}. It is separate
 * because the build folder is named after a hash of the manifest pair, so the
 * hash has to read the manifest before the build folder exists.
 * @param {{CARGO_TOML: string}} constants file names of the cargo manifests
 * @returns {(currentFolder: string, endFolder: string, fileEntry: string) => {folder: string, data: object}}
 */
function locateCargoBy(constants) {
    function locateCargo(currentFolder, endFolder, fileEntry) {
        const tomlFile = path.join(currentFolder, constants.CARGO_TOML);
        if (fs.existsSync(tomlFile)) {
            const data = tomlToJson(
                fs.readFileSync(tomlFile, {
                    encoding: "utf8",
                }),
            );
            // if this lib already have a path, check if this path equals to our .rs file
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
        // try to find Cargo.lock file in folder
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
