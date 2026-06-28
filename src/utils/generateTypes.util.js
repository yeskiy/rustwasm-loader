const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const findNearestCargoBy = require("./findNearestCargo.util");
const spawnWasmPack = require("./spawnWasmPack.util");
const writeSidecar = require("./writeSidecar.util");

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

// Per-source build dir, content-addressed by the source hash so an unchanged
// `.rs` is a wasm-pack cache hit on the next run. The `.types` suffix keeps the
// typed build separate from the loader's normal inline build of the same source.
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

/**
 * Builds a `.rs` source with wasm-bindgen typings enabled, transforms the
 * generated `.d.ts` into a sidecar matching the loader's runtime default export,
 * and writes `<name>.d.rs.ts` next to the source. Reuses the loader's
 * Cargo-discovery and wasm-pack pipeline; idempotent across runs.
 * @param {string} resourcePath absolute path to the `.rs` file
 * @param {{ baseFolder?: string, logLevel?: string }} [options]
 * @returns {Promise<string>} the written sidecar path
 */
module.exports = async function generateTypes(resourcePath, options = {}) {
    const baseFolder = path.normalize(options.baseFolder || process.cwd());
    const fileEntry = path.normalize(resourcePath);
    const { dir } = path.parse(fileEntry);
    const buildFolder = typedBuildFolder(resourcePath);
    const outDir = path.join(buildFolder, "pkg");

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

    return writeSidecar(
        resourcePath,
        fs.readFileSync(
            path.join(outDir, `${constants.OUT_NAME}.d.ts`),
            "utf8",
        ),
    );
};
