const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { parse: tomlToJson } = require("toml");

const WASM_TARGET = "wasm32-unknown-unknown";
const PROFILE = "release";

/**
 * Returns the cargo target folder that a build in `buildFolder` writes to.
 * `CARGO_TARGET_DIR` wins, and a relative value resolves against the build folder.
 * @param {string} buildFolder the folder wasm-pack runs in
 * @returns {string}
 */
const targetFolderFor = (buildFolder) =>
    process.env.CARGO_TARGET_DIR
        ? path.resolve(buildFolder, process.env.CARGO_TARGET_DIR)
        : path.join(buildFolder, "target");

function crateNameOf(buildFolder) {
    const manifest = tomlToJson(
        fs.readFileSync(path.join(buildFolder, "Cargo.toml"), "utf8"),
    );
    return (manifest.lib?.name || manifest.package?.name || "").replaceAll(
        "-",
        "_",
    );
}

const depInfoPathFor = (buildFolder) =>
    path.join(
        targetFolderFor(buildFolder),
        WASM_TARGET,
        PROFILE,
        `${crateNameOf(buildFolder)}.d`,
    );

/**
 * Reads the prerequisites of the first rule of a Makefile dep-info file.
 * A backslash before a newline continues the line, and `\ ` is a literal space.
 * @param {string} text the dep-info file content
 * @returns {string[]}
 */
function parseDepInfo(text) {
    const rule = text
        .replace(/\\\r?\n/g, " ")
        .split(/\r?\n/)
        .find((line) => line.trim() !== "" && !line.startsWith("#"));
    const separator = rule ? rule.search(/(?<!\\):(?:\s|$)/) : -1;
    return separator === -1
        ? []
        : rule
              .slice(separator + 1)
              .trim()
              .split(/(?<!\\)\s+/)
              .filter(Boolean)
              .map((token) => token.replaceAll("\\ ", " "));
}

const homeOf = (variable, folder) =>
    process.env[variable]
        ? path.resolve(process.env[variable])
        : path.join(os.homedir(), folder);

function isInside(root, file) {
    const relative = path.relative(root, file);
    return (
        relative !== "" &&
        !relative.startsWith("..") &&
        !path.isAbsolute(relative)
    );
}

/**
 * Keeps the project files of a dep-info list. Files under the cargo home, the
 * rustup home, or the target folder are registry, toolchain, or generated files.
 * @param {string[]} files absolute paths from the dep-info file
 * @param {string} targetFolder the cargo target folder of the build
 * @returns {string[]} normalized, sorted, and unique paths
 */
const localSources = (files, targetFolder) =>
    [
        ...new Set(
            files
                .map((file) => path.resolve(file))
                .filter(
                    (file) =>
                        ![
                            homeOf("CARGO_HOME", ".cargo"),
                            homeOf("RUSTUP_HOME", ".rustup"),
                            targetFolder,
                        ].some((root) => isInside(root, file)),
                ),
        ),
    ].sort();

const recordPathFor = (resourcePath) =>
    path.join(
        os.tmpdir(),
        `${path.basename(resourcePath)}.${crypto
            .createHash("sha256")
            .update(path.resolve(resourcePath))
            .digest("hex")}.sources.json`,
    );

/**
 * Lists the Rust files, other than the entry itself, that the last build of
 * `resourcePath` compiled. Gives an empty list when no build recorded them.
 * @param {string} resourcePath absolute path to the `.rs` entry
 * @returns {string[]}
 */
function recordedSources(resourcePath) {
    try {
        const files = JSON.parse(
            fs.readFileSync(recordPathFor(resourcePath), "utf8"),
        );
        return Array.isArray(files)
            ? files.filter((file) => typeof file === "string")
            : [];
    } catch {
        return [];
    }
}

const writeAtomically = (file, content) => {
    const scratch = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(scratch, content);
    try {
        fs.renameSync(scratch, file);
    } catch {
        // Windows refuses the rename while another process reads the file.
        fs.writeFileSync(file, content);
        fs.rmSync(scratch, { force: true });
    }
};

/**
 * Reads the dep-info file of a finished build and records its local sources for
 * the entry. Keeps the old record when the build left no dep-info file.
 * @param {string} resourcePath absolute path to the `.rs` entry
 * @param {string} buildFolder the folder wasm-pack ran in
 * @returns {string[]} the recorded sources
 */
function recordSources(resourcePath, buildFolder) {
    const depInfo = depInfoPathFor(buildFolder);
    if (!fs.existsSync(depInfo)) {
        return recordedSources(resourcePath);
    }
    const sources = localSources(
        parseDepInfo(fs.readFileSync(depInfo, "utf8")),
        targetFolderFor(buildFolder),
    ).filter((file) => file !== path.resolve(resourcePath));
    const content = JSON.stringify(sources);
    const record = recordPathFor(resourcePath);
    if (!fs.existsSync(record) || fs.readFileSync(record, "utf8") !== content) {
        writeAtomically(record, content);
    }
    return sources;
}

module.exports = {
    targetFolderFor,
    depInfoPathFor,
    parseDepInfo,
    localSources,
    recordPathFor,
    recordedSources,
    recordSources,
};
