const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const pack = require("./pack");
const { packParams, skip, tempDir } = require("../test/helpers");

const BINDGEN_LIB = [
    "use wasm_bindgen::prelude::*;",
    "",
    "#[wasm_bindgen]",
    "pub fn quadruple(n: u32) -> u32 {",
    "    helper::double(helper::double(n))",
    "}",
    "",
].join("\n");

const HELPER_LIB = "pub fn double(n: u32) -> u32 {\n    n * 2\n}\n";

function writeTree(dir, files) {
    Object.entries(files).forEach(([file, content]) => {
        fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
        fs.writeFileSync(path.join(dir, file), content);
    });
}

// Builds `entry` of the crate tree with the loader into a build folder outside the tree,
// then imports the inline module and calls `quadruple`.
async function buildAndRun(files, entry) {
    const dir = tempDir("rs-pack-paths-");
    const buildFolder = tempDir("rs-pack-paths-build-");
    try {
        writeTree(dir, files);
        const modulePath = path.join(dir, "mod.mjs");
        fs.writeFileSync(
            modulePath,
            await pack(
                packParams(dir, {
                    resourcePath: path.join(dir, entry),
                    buildFolder,
                }),
                () => undefined,
            ),
        );
        return (await import(pathToFileURL(modulePath).href)).default.quadruple(
            3,
        );
    } finally {
        [dir, buildFolder].forEach((folder) =>
            fs.rmSync(folder, { recursive: true, force: true }),
        );
    }
}

test(
    "builds a crate that depends on its parent crate through a relative path",
    { skip },
    async () => {
        assert.equal(
            await buildAndRun(
                {
                    "Cargo.toml":
                        '[package]\nname = "helper"\nversion = "0.1.0"\nedition = "2021"\n',
                    "src/lib.rs": HELPER_LIB,
                    "child/Cargo.toml": [
                        "[package]",
                        'name = "child"',
                        'version = "0.1.0"',
                        'edition = "2021"',
                        "",
                        "[lib]",
                        'crate-type = ["cdylib"]',
                        'path = "lib.rs"',
                        "",
                        "[dependencies]",
                        'wasm-bindgen = "0.2.95"',
                        'helper = { path = ".." }',
                        "",
                    ].join("\n"),
                    "child/lib.rs": BINDGEN_LIB,
                },
                path.join("child", "lib.rs"),
            ),
            12,
        );
    },
);

test(
    "builds a workspace member that inherits from the root and depends on a sibling",
    { skip },
    async () => {
        assert.equal(
            await buildAndRun(
                {
                    "Cargo.toml": [
                        "[workspace]",
                        'members = ["app", "helper"]',
                        'resolver = "2"',
                        "",
                        "[workspace.package]",
                        'version = "0.2.0"',
                        'edition = "2021"',
                        "",
                        "[workspace.dependencies]",
                        'wasm-bindgen = "0.2.95"',
                        "",
                        "[profile.release]",
                        'opt-level = "s"',
                        "",
                    ].join("\n"),
                    "helper/Cargo.toml":
                        '[package]\nname = "helper"\nversion.workspace = true\nedition.workspace = true\n',
                    "helper/src/lib.rs": HELPER_LIB,
                    "app/Cargo.toml": [
                        "[package]",
                        'name = "app"',
                        "version.workspace = true",
                        "edition.workspace = true",
                        "",
                        "[lib]",
                        'crate-type = ["cdylib"]',
                        "",
                        "[dependencies]",
                        "wasm-bindgen.workspace = true",
                        'helper = { path = "../helper" }',
                        "",
                    ].join("\n"),
                    "app/src/lib.rs": BINDGEN_LIB,
                },
                path.join("app", "src", "lib.rs"),
            ),
            12,
        );
    },
);
