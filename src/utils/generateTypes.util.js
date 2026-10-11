const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const {
    findNearestCargo,
    writeCargoFiles,
} = require("./findNearestCargo.util");
const spawnWasmPack = require("./spawnWasmPack.util");
const writeSidecar = require("./writeSidecar.util");
const withBuildLock = require("./buildLock.util");
const { logLevelSelector } = require("../pack");
const { tempBuildFolder } = require("../shared-load.util");

const OUT_NAME = "types";

// Build folder named after the source hash, so an unchanged `.rs` reuses the cache.
// The `.types` suffix keeps the typed build apart from the normal build of the same source.
const typedBuildFolder = (resourcePath) =>
    tempBuildFolder(
        resourcePath,
        crypto
            .createHash("sha256")
            .update(fs.readFileSync(resourcePath))
            .digest("hex"),
        "types",
    );

// Builds a `.rs` source with typings and returns the wasm-bindgen `.d.ts` without a write
// next to the source. The tsserver plugin uses it, and `generateTypes` adds the sidecar write.
async function buildTypedDts(resourcePath, options = {}) {
    const baseFolder = path.normalize(options.baseFolder || process.cwd());
    const fileEntry = path.normalize(resourcePath);
    const { dir } = path.parse(fileEntry);
    const buildFolder = typedBuildFolder(resourcePath);
    const outDir = path.join(buildFolder, "pkg");

    return withBuildLock(buildFolder, async () => {
        writeCargoFiles(
            buildFolder,
            findNearestCargo(dir, baseFolder, fileEntry, buildFolder),
        );

        await spawnWasmPack({
            cwd: buildFolder,
            outDir,
            outName: OUT_NAME,
            typescript: true,
            args: logLevelSelector(options.logLevel || "info"),
            extraArgs: ["--target", "web"],
        });

        return fs.readFileSync(path.join(outDir, `${OUT_NAME}.d.ts`), "utf8");
    });
}

// Builds the typings of a `.rs` source and writes the `<name>.d.rs.ts` sidecar next to it.
async function generateTypes(resourcePath, options = {}) {
    return writeSidecar(
        resourcePath,
        await buildTypedDts(resourcePath, options),
    );
}

module.exports = generateTypes;
module.exports.buildTypedDts = buildTypedDts;
