const path = require("path");
const jsonToToml = require("json2toml");
const fs = require("fs");
const { parse: tomlToJson } = require("toml");

module.exports = function findNearestCargoBy(constants) {
    function findNearestCargo(
        currentFolder,
        endFolder,
        fileEntry,
        buildFolder,
    ) {
        function stepDown() {
            if (path.normalize(currentFolder) === endFolder) {
                throw new Error(
                    `Cannot Find "${constants.CARGO_TOML}" to create wasm`,
                );
            } else {
                return findNearestCargo(
                    path.resolve(currentFolder, "../"),
                    endFolder,
                    fileEntry,
                    buildFolder,
                );
            }
        }

        function complete(data) {
            const returnData = {
                [constants.CARGO_TOML]: jsonToToml(
                    {
                        ...data,
                        lib: {
                            ...data.lib,
                            path: (() => {
                                const fileEntryDirs = fileEntry.split(path.sep);
                                if (
                                    buildFolder
                                        .split(path.sep)
                                        .some((dir) =>
                                            fileEntryDirs.includes(dir),
                                        )
                                ) {
                                    return path
                                        .relative(buildFolder, fileEntry)
                                        .split(path.sep)
                                        .join(path.posix.sep);
                                }
                                return fileEntry;
                            })(),
                        },
                    },
                    { indent: 2, newlineAfterSection: true },
                ),
            };
            // try to find Cargo.lock file in folder
            const lockPath = path.join(currentFolder, constants.CARGO_LOCK);
            if (fs.existsSync(lockPath)) {
                returnData[constants.CARGO_LOCK] = fs.readFileSync(lockPath, {
                    encoding: "utf-8",
                });
            }
            return returnData;
        }

        // Check, if this folder consists Cargo file
        const tomlFile = path.join(currentFolder, constants.CARGO_TOML);
        if (fs.existsSync(tomlFile)) {
            // Parsing .toml file
            const data = tomlToJson(
                fs.readFileSync(tomlFile, {
                    encoding: "utf8",
                }),
            );

            // if this lib already have a path, check if this path equals to our .rs file
            if (data.lib.path) {
                const fullPath = path.resolve(currentFolder, data.lib.path);
                if (path.normalize(fullPath) === fileEntry) {
                    return complete(data);
                }
                return stepDown();
            }
            return complete(data);
        }

        return stepDown();
    }
    return findNearestCargo;
};
