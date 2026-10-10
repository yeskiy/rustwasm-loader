const fs = require("node:fs");
const path = require("node:path");
const buildInputsHash = require("./buildInputsHash.util");
const edgeWasmPath = require("./edgeCache.util");

// Directories a project never keeps its own Rust sources in. `target` holds
// cargo output, and the others hold dependencies, build state and history.
const SKIPPED_DIRS = new Set(["node_modules", ".next", "target", ".git"]);

const rsFileIn = (dir, entry) =>
    entry.isFile() && entry.name.endsWith(".rs")
        ? [path.join(dir, entry.name)]
        : [];

// Lists the `.rs` files under a project root. `isDirectory()` is false for a symbolic link
// and a Windows junction, so the walk does not follow a link that makes a directory cycle.
function scanRsFiles(dir) {
    return fs
        .readdirSync(dir, { withFileTypes: true })
        .flatMap((entry) =>
            entry.isDirectory() && !SKIPPED_DIRS.has(entry.name)
                ? scanRsFiles(path.join(dir, entry.name))
                : rsFileIn(dir, entry),
        );
}

const joinPatterns = (patterns, separator) =>
    new RegExp(patterns.map((pattern) => pattern.source).join(separator), "g");

// Comments, string literals and char literals. Strings keep their text in
// URI-encoded form, so a `mod x;` or a brace inside one cannot match.
const LEXEMES = joinPatterns(
    [
        /\/\/[^\n]*/,
        /\/\*[\s\S]*?\*\//,
        /b?r(#*)"([\s\S]*?)"\1/,
        /b?"((?:\\[\s\S]|[^"\\])*)"/,
        /b?'(?:\\[^'\n]+|[^\\'\n])'/,
    ],
    "|",
);

// Attributes, then an optional visibility, then `mod name;`.
const DECLARATION = joinPatterns(
    [
        /(?<![\w$])((?:#\s*\[[^\]]*\]\s*)*)/,
        /(?:pub(?:\s*\([^)]*\)\s*|\s+))?/,
        /mod\s+(?:r#)?([A-Za-z_]\w*)\s*;/,
    ],
    "",
);

const PATH_ATTRIBUTE = /#\s*\[\s*path\s*=\s*"([^"]*)"\s*\]/;

const braceDepth = (code) => code.split("{").length - code.split("}").length;

// Lists the top-level file module declarations (`mod name;`) of a Rust source,
// each with the value of its `#[path]` attribute when one is present.
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

// Lists the files that one declaration can name. A mod-rs file (a crate root, a `mod.rs`,
// or a file that a `#[path]` loads) owns the modules of its directory.
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

// Lists the scanned `.rs` files that one of the `roots` declares as a module, at any depth.
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
                  (next, child) => visit(next, child),
                  found.add(`${modRs} ${file}`),
              );
    return new Set(
        [
            ...roots
                .flatMap((root) => children(root, true))
                .reduce((found, child) => visit(found, child), new Set()),
        ].map((key) => key.slice(key.indexOf(" ") + 1)),
    );
}

// Lists the scanned `.rs` files that another scanned file declares as a module. Pass one
// treats every file as a root. Pass two uses only the files that pass one did not reach.
function moduleFiles(files) {
    const scanned = new Set(files);
    const firstPass = reachModules(files, scanned);
    return reachModules(
        files.filter((file) => !firstPass.has(file)),
        scanned,
    );
}

// Runs the loader on one `.rs` file with the loader context of Turbopack, outside a bundler.
// Only the loader derives the wasm file name that the build expects.
function runLoader(resourcePath, baseFolder, loaderOptions) {
    // Required inside the call, because the loader reaches this helper through the Next entry
    // point, and a top-level require makes a load cycle.
    const loader = require("..");
    return new Promise((resolve, reject) => {
        loader
            .call(
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
            )
            .catch(reject);
    });
}

// Tells whether the Edge wasm of a `.rs` file is missing. A scanned file outside a crate is
// skipped, but a file that the caller `named` throws its error.
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

// Builds the Edge wasm of each `.rs` file before the bundler starts. The Turbopack cache in
// `.next` cannot resolve a wasm file that first appears during the build.
async function prebuildEdgeWasm(baseFolder, loaderOptions, explicit) {
    const files = explicit
        ? explicit.map((file) => path.resolve(baseFolder, file))
        : scanRsFiles(baseFolder);

    // A module file can fail to compile alone, so a scan skips it. A named file always builds.
    const modules = explicit ? new Set() : moduleFiles(files);
    const pending = files.filter(
        (file) =>
            !modules.has(file) &&
            needsBuild(file, baseFolder, Boolean(explicit)),
    );

    // Builds one file at a time, because parallel cargo runs contend on the shared cargo cache.
    // The build-folder lock of the loader covers a second process.
    await pending.reduce(async (previous, file) => {
        await previous;
        try {
            await runLoader(file, baseFolder, loaderOptions);
        } catch (error) {
            throw new Error(
                `rust-wasmpack-loader: failed to pre-build ${file}: ${error.message}`,
            );
        }
    }, Promise.resolve());

    return { built: pending, scanned: files.length };
}

module.exports = prebuildEdgeWasm;
module.exports.scanRsFiles = scanRsFiles;
module.exports.moduleDeclarations = moduleDeclarations;
module.exports.moduleFiles = moduleFiles;
