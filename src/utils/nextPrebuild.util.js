const fs = require("node:fs");
const path = require("node:path");
const buildInputsHash = require("./buildInputsHash.util");
const edgeWasmPath = require("./edgeCache.util");

// Directories a project never keeps its own Rust sources in. `target` holds
// cargo output, and the others hold dependencies, build state and history.
const SKIPPED_DIRS = new Set(["node_modules", ".next", "target", ".git"]);

/**
 * Lists the `.rs` files under a project root.
 *
 * `entry.isDirectory()` is false for a symbolic link and for a Windows
 * junction, so the walk steps over both. An example that links the loader back
 * to the repository root makes a directory cycle, and the walk must not follow
 * it.
 * @param {string} dir directory to read
 * @returns {string[]} absolute paths of the `.rs` files below it
 */
const rsFileIn = (dir, entry) =>
    entry.isFile() && entry.name.endsWith(".rs")
        ? [path.join(dir, entry.name)]
        : [];

function scanRsFiles(dir) {
    return fs
        .readdirSync(dir, { withFileTypes: true })
        .flatMap((entry) =>
            entry.isDirectory() && !SKIPPED_DIRS.has(entry.name)
                ? scanRsFiles(path.join(dir, entry.name))
                : rsFileIn(dir, entry),
        );
}

/**
 * Runs the loader itself against one `.rs` file, outside any bundler, with the
 * loader context Turbopack supplies. Driving the real loader is what makes the
 * result usable: the wasm the build wants carries an internal name the loader
 * derives, and only the loader derives it the same way twice.
 * @param {string} resourcePath absolute path to the `.rs` file
 * @param {string} baseFolder project root
 * @param {object} loaderOptions options of the Edge pass
 * @returns {Promise<void>}
 */
function runLoader(resourcePath, baseFolder, loaderOptions) {
    // Required inside the call, because the loader module reaches this helper
    // through the Next entry point and the two would otherwise load in a cycle.

    const loader = require("..");
    return new Promise((resolve, reject) => {
        loader.call(
            {
                resourcePath,
                rootContext: baseFolder,
                target: "web",
                getOptions: () => loaderOptions,
                emitFile: () => undefined,
                addDependency: () => undefined,
                async: () => (error) => (error ? reject(error) : resolve()),
            },
            fs.readFileSync(resourcePath, "utf8"),
        );
    });
}

/**
 * Reports whether a `.rs` file still needs its Edge wasm written.
 *
 * A scan can reach a `.rs` file that belongs to no crate the loader could
 * build. Such a file cannot be imported either, so the scan passes over it. A
 * file the caller named is a different matter, and its error stands.
 * @param {string} file absolute path to the `.rs` file
 * @param {string} baseFolder project root
 * @param {boolean} named true when the caller listed the file itself
 * @returns {boolean}
 */
function needsBuild(file, baseFolder, named) {
    try {
        return !fs.existsSync(
            edgeWasmPath(
                baseFolder,
                buildInputsHash(
                    fs.readFileSync(file, "utf8"),
                    file,
                    baseFolder,
                ),
            ),
        );
    } catch (error) {
        if (named) {
            throw new Error(
                `rust-wasmpack-loader: cannot pre-build ${file}: ${error.message}`,
            );
        }
        return false;
    }
}

/**
 * Builds the Edge wasm of every `.rs` file before the bundler starts.
 *
 * Turbopack keeps a cache in `.next`. A wasm file that first appears while the
 * build runs is absent from that cache, so the build cannot resolve it, and a
 * dependency change is exactly the case that produces a new file name. A file
 * that is already on disk when the build starts is read normally.
 *
 * A file whose digest already names a wasm needs nothing, which is the usual
 * case and costs one hash and one `existsSync`.
 * @param {string} baseFolder project root
 * @param {object} loaderOptions options of the Edge pass
 * @param {string[]} [explicit] files to build instead of scanning the project
 * @returns {Promise<{built: string[], scanned: number}>}
 */
async function prebuildEdgeWasm(baseFolder, loaderOptions, explicit) {
    const files = explicit
        ? explicit.map((file) => path.resolve(baseFolder, file))
        : scanRsFiles(baseFolder);

    const pending = files.filter((file) =>
        needsBuild(file, baseFolder, Boolean(explicit)),
    );

    // One at a time. wasm-pack shells out to cargo, and parallel runs contend
    // on the shared cargo cache. The loader holds its own build-folder lock
    // across each run, which covers a second process.
    await pending.reduce(
        (chain, file) =>
            chain.then(() =>
                runLoader(file, baseFolder, loaderOptions).catch((error) => {
                    throw new Error(
                        `rust-wasmpack-loader: failed to pre-build ${file}: ${error.message}`,
                    );
                }),
            ),
        Promise.resolve(),
    );

    return { built: pending, scanned: files.length };
}

module.exports = prebuildEdgeWasm;
module.exports.scanRsFiles = scanRsFiles;
