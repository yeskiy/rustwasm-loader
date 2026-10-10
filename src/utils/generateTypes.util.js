const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const findNearestCargoBy = require("./findNearestCargo.util");
const spawnWasmPack = require("./spawnWasmPack.util");
const writeSidecar = require("./writeSidecar.util");
const withBuildLock = require("./buildLock.util");

const constants = Object.freeze({
    CARGO_TOML: "Cargo.toml",
    CARGO_LOCK: "Cargo.lock",
    OUT_NAME: "types",
});

function logLevelArgs(level) {
    switch (level) {
        case "quiet":
            return ["--quiet"];
        case "verbose":
            return ["--verbose"];
        default:
            return ["--log-level", level];
    }
}

// Build folder named after the source hash, so an unchanged `.rs` reuses the cache.
// The `.types` suffix keeps the typed build apart from the normal build of the same source.
function typedBuildFolder(resourcePath) {
    const hash = crypto
        .createHash("sha256")
        .update(fs.readFileSync(resourcePath))
        .digest("hex");
    const { base } = path.parse(path.normalize(resourcePath));
    const buildFolder = path.join(os.tmpdir(), `${base}.${hash}.types`);
    if (!fs.existsSync(buildFolder)) {
        fs.mkdirSync(buildFolder, { recursive: true });
    }
    return buildFolder;
}

// Builds a `.rs` source with typings and returns the wasm-bindgen `.d.ts` without a write
// next to the source. The tsserver plugin uses it, and `generateTypes` adds the sidecar write.
async function buildTypedDts(resourcePath, options = {}) {
    const baseFolder = path.normalize(options.baseFolder || process.cwd());
    const fileEntry = path.normalize(resourcePath);
    const { dir } = path.parse(fileEntry);
    const buildFolder = typedBuildFolder(resourcePath);
    const outDir = path.join(buildFolder, "pkg");

    return withBuildLock(buildFolder, async () => {
        const cargoData = findNearestCargoBy(constants)(
            dir,
            baseFolder,
            fileEntry,
            buildFolder,
        );
        fs.writeFileSync(
            path.join(buildFolder, constants.CARGO_TOML),
            cargoData[constants.CARGO_TOML],
            { encoding: "utf8" },
        );
        if (cargoData[constants.CARGO_LOCK]) {
            fs.writeFileSync(
                path.join(buildFolder, constants.CARGO_LOCK),
                cargoData[constants.CARGO_LOCK],
                { encoding: "utf8" },
            );
        }

        await spawnWasmPack({
            cwd: buildFolder,
            outDir,
            outName: constants.OUT_NAME,
            typescript: true,
            args: logLevelArgs(options.logLevel || "info"),
            extraArgs: ["--target", "web"],
        });

        return fs.readFileSync(
            path.join(outDir, `${constants.OUT_NAME}.d.ts`),
            "utf8",
        );
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
