const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { parse: tomlToJson } = require("toml");

const WASM_TARGET = "wasm32-unknown-unknown";
const PROFILE = "release";

// The cargo target folder of a build. A relative `CARGO_TARGET_DIR` resolves against `buildFolder`.
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

// Reads the prerequisites of the first rule of a Makefile dep-info file.
// A backslash before a newline continues the line, and `\ ` is a literal space.
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
              .map((token) => token.replaceAll(String.raw`\ `, " "));
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

// Keeps the project files of a dep-info list as sorted unique paths. It drops the files under
// the cargo home, the rustup home, and the target folder.
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
    ].sort((a, b) => Number(a > b) - Number(a < b));

const recordPathFor = (resourcePath) =>
    path.join(
        os.tmpdir(),
        `${path.basename(resourcePath)}.${crypto
            .createHash("sha256")
            .update(path.resolve(resourcePath))
            .digest("hex")}.sources.json`,
    );

// Lists the Rust files, other than the entry, that the last build of `resourcePath` compiled.
// The list is empty when no build recorded them.
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

// Records the local sources from the dep-info file of a finished build of the entry.
// When the build left no dep-info file, the previous record stays.
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
