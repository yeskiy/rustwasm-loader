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

// Comments, string literals and char literals. Strings keep their text in
// URI-encoded form, so a `mod x;` or a brace inside one cannot match.
const LEXEMES =
    /\/\/[^\n]*|\/\*[\s\S]*?\*\/|b?r(#*)"([\s\S]*?)"\1|b?"((?:\\[\s\S]|[^"\\])*)"|b?'(?:\\[^'\n]+|[^\\'\n])'/g;

const DECLARATION =
    /(?<![\w$])((?:#\s*\[[^\]]*\]\s*)*)(?:pub(?:\s*\([^)]*\)\s*|\s+))?mod\s+(?:r#)?([A-Za-z_]\w*)\s*;/g;

const PATH_ATTRIBUTE = /#\s*\[\s*path\s*=\s*"([^"]*)"\s*\]/;

const braceDepth = (code) => code.split("{").length - code.split("}").length;

/**
 * Lists the file module declarations (`mod name;`) at the top level of a Rust
 * source, with the value of a `#[path]` attribute when one is present.
 * @param {string} source Rust source text
 * @returns {{name: string, path: (string|undefined)}[]}
 */
function moduleDeclarations(source) {
    const code = source.replace(LEXEMES, (lexeme, hashes, raw, plain) => {
        const text = raw ?? plain;
        return text === undefined ? " " : `"${encodeURIComponent(text)}"`;
    });
    return [...code.matchAll(DECLARATION)]
        .filter((match) => braceDepth(code.slice(0, match.index)) === 0)
        .map(([, attributes, name]) => {
            const attribute = PATH_ATTRIBUTE.exec(attributes);
            return {
                name,
                path: attribute ? decodeURIComponent(attribute[1]) : undefined,
            };
        });
}

/**
 * Lists the files one declaration can name. A mod-rs file (a crate root, a
 * `mod.rs`, or a file a `#[path]` loads) owns the modules of its directory.
 * @param {string} file declaring file
 * @param {boolean} modRs true when the file is a mod-rs file
 * @param {{name: string, path: (string|undefined)}} declaration
 * @returns {{file: string, modRs: boolean}[]}
 */
function moduleCandidates(file, modRs, { name, path: attributePath }) {
    const base = modRs
        ? path.dirname(file)
        : path.join(path.dirname(file), path.basename(file, ".rs"));
    return attributePath === undefined
        ? [
              { file: path.join(base, `${name}.rs`), modRs: false },
              { file: path.join(base, name, "mod.rs"), modRs: true },
          ]
        : [
              {
                  file: path.resolve(path.dirname(file), attributePath),
                  modRs: true,
              },
          ];
}

/**
 * Lists the `.rs` files that one of the given files declares as a module, at
 * any depth. Each file in the list counts as a crate root.
 * @param {string[]} roots absolute paths of the crate roots
 * @param {Set<string>} scanned absolute paths of every scanned `.rs` file
 * @returns {Set<string>}
 */
function reachModules(roots, scanned) {
    const children = (file, modRs) =>
        moduleDeclarations(fs.readFileSync(file, "utf8"))
            .flatMap((declaration) =>
                moduleCandidates(file, modRs, declaration),
            )
            .filter((candidate) => scanned.has(candidate.file));
    // A file can be reached as a mod-rs file and as a plain one, and each
    // reading can declare different modules.
    const visit = (found, { file, modRs }) =>
        found.has(`${modRs} ${file}`)
            ? found
            : children(file, modRs).reduce(
                  visit,
                  found.add(`${modRs} ${file}`),
              );
    return new Set(
        [
            ...roots
                .flatMap((root) => children(root, true))
                .reduce(visit, new Set()),
        ].map((key) => key.slice(key.indexOf(" ") + 1)),
    );
}

/**
 * Lists the scanned `.rs` files that another scanned file declares as a module.
 * Pass one treats every file as a root, pass two only the roots pass one left.
 * @param {string[]} files absolute paths of the scanned `.rs` files
 * @returns {Set<string>}
 */
function moduleFiles(files) {
    const scanned = new Set(files);
    const firstPass = reachModules(files, scanned);
    return reachModules(
        files.filter((file) => !firstPass.has(file)),
        scanned,
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

    // A module file is part of the crate that declares it, and alone it can
    // fail to compile. Only a scan skips it, a named file always builds.
    const modules = explicit ? new Set() : moduleFiles(files);
    const pending = files.filter(
        (file) =>
            !modules.has(file) &&
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
module.exports.moduleDeclarations = moduleDeclarations;
module.exports.moduleFiles = moduleFiles;
