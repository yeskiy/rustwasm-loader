const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { parse: tomlToJson } = require("toml");
const { CARGO_TOML, locateCargo } = require("./findNearestCargo.util");

const WASM_TARGET = "wasm32-unknown-unknown";
const PROFILE = "release";
const FINGERPRINT_HASH = /^[0-9a-f]{16}$/;

// The absolute folder of the `Cargo.toml` that owns the `.rs` entry.
const manifestFolderFor = (resourcePath, baseFolder) =>
    path.resolve(
        locateCargo(
            path.parse(path.normalize(resourcePath)).dir,
            path.normalize(baseFolder),
            path.normalize(resourcePath),
        ).folder,
    );

// Windows paths are case-insensitive, so one folder must give one key.
const keyOf = (folder) =>
    crypto
        .createHash("sha256")
        .update(process.platform === "win32" ? folder.toLowerCase() : folder)
        .digest("hex")
        .slice(0, 16);

// Creates `folder` with mode 0o700 when it is missing, then checks that it is a plain
// folder of the current user. On POSIX, it removes the group and other bits.
function ensurePrivateFolder(folder) {
    try {
        fs.mkdirSync(folder, { mode: 0o700 });
    } catch (error) {
        if (error.code !== "EEXIST") {
            throw error;
        }
    }
    const stat = fs.lstatSync(folder);
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
        throw new Error(
            `rust-wasmpack-loader: "${folder}" is a symlink or not a folder. Remove it and build again.`,
        );
    }
    if (typeof process.getuid === "function" && stat.uid !== process.getuid()) {
        throw new Error(
            `rust-wasmpack-loader: "${folder}" belongs to another user. Remove it or set CARGO_TARGET_DIR.`,
        );
    }
    // The owner check comes first, so chmod never runs on a folder of another user.
    // The remainder of a division by 0o100 holds the group and other bits.
    if (process.platform !== "win32" && stat.mode % 0o100 !== 0) {
        fs.chmodSync(folder, 0o700);
    }
    return folder;
}

const cacheRoot = () =>
    ensurePrivateFolder(path.join(os.tmpdir(), "rust-wasmpack-loader"));

// The shared cargo target folder of the manifest in `manifestFolder`, without a check.
const sharedTargetFolderOf = (manifestFolder) =>
    path.join(cacheRoot(), `target-${keyOf(path.resolve(manifestFolder))}`);

// One cargo target folder for each manifest. A relative `CARGO_TARGET_DIR` resolves
// against the build folder, which is the cargo working folder.
const targetFolderFor = (resourcePath, baseFolder, buildFolder) =>
    process.env.CARGO_TARGET_DIR
        ? path.resolve(buildFolder, process.env.CARGO_TARGET_DIR)
        : ensurePrivateFolder(
              sharedTargetFolderOf(manifestFolderFor(resourcePath, baseFolder)),
          );

const targetLockFor = (targetFolder) =>
    path.join(cacheRoot(), `lock-${keyOf(path.resolve(targetFolder))}`);

function crateNamesOf(buildFolder) {
    const manifest = tomlToJson(
        fs.readFileSync(path.join(buildFolder, CARGO_TOML), "utf8"),
    );
    const packageName = manifest.package?.name || "";
    return {
        packageName,
        libName: (manifest.lib?.name || packageName).replaceAll("-", "_"),
    };
}

const outputFolderOf = (targetFolder) =>
    path.join(targetFolder, WASM_TARGET, PROFILE);

const wasmOutputPathFor = (targetFolder, libName) =>
    path.join(outputFolderOf(targetFolder), `${libName}.wasm`);

const markerPathOf = (wasmPath) => `${wasmPath}.inputs.json`;

const statOf = (file) =>
    fs.existsSync(file) ? fs.statSync(file, { bigint: true }) : null;

function readMarker(wasmPath) {
    try {
        return JSON.parse(fs.readFileSync(markerPathOf(wasmPath), "utf8"));
    } catch {
        return null;
    }
}

function writeMarker(wasmPath, inputs) {
    const stat = statOf(wasmPath);
    fs.writeFileSync(
        markerPathOf(wasmPath),
        JSON.stringify({
            inputs,
            mtimeNs: String(stat.mtimeNs),
            size: Number(stat.size),
        }),
    );
}

// True only when the last build in this folder had the same inputs and nothing rewrote its output.
function markerMatches(wasmPath, inputs) {
    const marker = readMarker(wasmPath);
    const stat = statOf(wasmPath);
    return (
        !!marker &&
        !!stat &&
        marker.inputs === inputs &&
        marker.mtimeNs === String(stat.mtimeNs) &&
        marker.size === Number(stat.size)
    );
}

// Removes the cargo fingerprints of one package. Cargo then compiles it again and keeps the dependencies.
function invalidateCrate(targetFolder, packageName) {
    const prints = path.join(outputFolderOf(targetFolder), ".fingerprint");
    const prefix = `${packageName}-`;
    if (fs.existsSync(prints)) {
        fs.readdirSync(prints)
            .filter(
                (name) =>
                    name.startsWith(prefix) &&
                    FINGERPRINT_HASH.test(name.slice(prefix.length)),
            )
            .forEach((name) =>
                fs.rmSync(path.join(prints, name), {
                    recursive: true,
                    force: true,
                }),
            );
    }
}

module.exports = {
    manifestFolderFor,
    ensurePrivateFolder,
    cacheRoot,
    sharedTargetFolderOf,
    targetFolderFor,
    targetLockFor,
    crateNamesOf,
    wasmOutputPathFor,
    readMarker,
    writeMarker,
    markerMatches,
    invalidateCrate,
};
