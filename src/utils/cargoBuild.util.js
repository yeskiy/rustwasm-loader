const fs = require("node:fs");
const spawnWasmPack = require("./spawnWasmPack.util");
const { withTargetLock } = require("./buildLock.util");
const buildInputsHash = require("./buildInputsHash.util");
const { recordSources } = require("./rustSources.util");
const cargoTarget = require("./cargoTarget.util");

const mtimeOf = (file) =>
    fs.existsSync(file) ? fs.statSync(file, { bigint: true }).mtimeNs : null;

// Runs wasm-pack for one entry against the shared cargo target folder of its manifest.
// The caller writes the temp manifests first and holds the build-folder lock.
function buildCrate({ resourcePath, baseFolder, buildFolder, wasmPack }) {
    const targetFolder = cargoTarget.targetFolderFor(
        resourcePath,
        baseFolder,
        buildFolder,
    );
    return withTargetLock(cargoTarget.targetLockFor(targetFolder), async () => {
        const inputs = buildInputsHash(
            fs.readFileSync(resourcePath),
            resourcePath,
            baseFolder,
        );
        const { packageName, libName } = cargoTarget.crateNamesOf(buildFolder);
        const wasm = cargoTarget.wasmOutputPathFor(targetFolder, libName);
        const current = cargoTarget.markerMatches(wasm, inputs);
        if (!current) {
            cargoTarget.invalidateCrate(targetFolder, packageName);
        }
        const before = mtimeOf(wasm);
        await spawnWasmPack({
            ...wasmPack,
            cwd: buildFolder,
            targetDir: targetFolder,
        });
        const after = mtimeOf(wasm);
        if (!current && (after === null || after === before)) {
            throw new Error(
                `rust-wasmpack-loader: cargo did not rebuild "${resourcePath}" in "${targetFolder}", so its output can be stale.`,
            );
        }
        cargoTarget.writeMarker(wasm, inputs);
        recordSources(resourcePath, buildFolder, targetFolder);
    });
}

module.exports = buildCrate;
