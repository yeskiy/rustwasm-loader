const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const pack = require("./pack");
const { buildTypedDts } = require("./utils/generateTypes.util");
const { targetFolderFor } = require("./utils/cargoTarget.util");
const { recordPathFor } = require("./utils/rustSources.util");
const { packParams, removeCrate, skip, tempDir } = require("../test/helpers");

const LOCK = path.join(
    __dirname,
    "..",
    "example",
    "node-webpack",
    "Cargo.lock",
);
const fn = (name, value) =>
    `use wasm_bindgen::prelude::*;\n#[wasm_bindgen]\npub fn ${name}() -> u32 { ${value} }\n`;

const dir = tempDir("rs-shared-");
// Outside the crate, so cargo does not read the crate manifest as a workspace root.
const builds = tempDir("rs-shared-builds-");
const entryOf = (name) => path.join(dir, name);
fs.writeFileSync(
    path.join(dir, "Cargo.toml"),
    '[package]\nname = "wasm-fibonacci-test"\nversion = "0.1.0"\nedition = "2021"\n\n[lib]\ncrate-type = ["cdylib"]\n\n[dependencies]\nwasm-bindgen = "0.2.95"\n',
);
fs.copyFileSync(LOCK, path.join(dir, "Cargo.lock"));

test.after(() => {
    ["a.rs", "b.rs"].forEach((name) =>
        fs.rmSync(recordPathFor(entryOf(name)), { force: true }),
    );
    removeCrate(dir);
    fs.rmSync(builds, { recursive: true, force: true });
});

// Builds one entry in a new build folder and imports the emitted module.
async function run(name) {
    const buildFolder = fs.mkdtempSync(path.join(builds, "build-"));
    const js = await pack(
        packParams(dir, { resourcePath: entryOf(name), buildFolder }),
        () => undefined,
    );
    const file = `${buildFolder}.mjs`;
    fs.writeFileSync(file, js);
    return {
        mod: (await import(pathToFileURL(file).href)).default,
        buildFolder,
    };
}

test(
    "two entries of one manifest share a target folder and keep their own output",
    { skip },
    async () => {
        fs.writeFileSync(entryOf("a.rs"), fn("a", 1));
        fs.writeFileSync(entryOf("b.rs"), fn("b", 2));
        const first = await run("a.rs");
        assert.equal(first.mod.a(), 1);
        assert.equal((await run("b.rs")).mod.b(), 2);
        assert.equal((await run("a.rs")).mod.a(), 1);
        assert.equal(
            fs.existsSync(path.join(first.buildFolder, "target")),
            false,
        );
        assert.equal(
            fs.existsSync(
                path.join(
                    targetFolderFor(entryOf("a.rs"), dir, first.buildFolder),
                    "wasm32-unknown-unknown",
                    "release",
                ),
            ),
            true,
        );
    },
);

test(
    "an edit with an old modification time still gives the new output",
    { skip },
    async () => {
        const entry = entryOf("a.rs");
        fs.writeFileSync(entry, fn("a", 10));
        const { mtime, atime } = fs.statSync(entry);
        assert.equal((await run("a.rs")).mod.a(), 10);
        fs.writeFileSync(entry, fn("a", 20));
        fs.utimesSync(entry, atime, mtime);
        assert.equal((await run("a.rs")).mod.a(), 20);
    },
);

test("the typed build uses the same target folder", { skip }, async () => {
    const dts = await buildTypedDts(entryOf("b.rs"), {
        baseFolder: dir,
        logLevel: "error",
    });
    assert.match(dts, /export function b\(\): number;/);
});
