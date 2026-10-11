const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
    parseDepInfo,
    localSources,
    depInfoPathFor,
    recordPathFor,
    recordedSources,
    recordSources,
} = require("./rustSources.util");
const { tempDir, withEnv } = require("../../test/helpers");

test("reads the prerequisites of the first rule", () => {
    assert.deepEqual(
        parseDepInfo("/t/out.wasm: /p/src/lib.rs /p/src/util.rs\n"),
        ["/p/src/lib.rs", "/p/src/util.rs"],
    );
});

test("joins continuation lines and unescapes spaces", () => {
    assert.deepEqual(
        parseDepInfo(
            "/t/my\\ out.wasm: /p/my\\ dir/lib.rs \\\n  /p/my\\ dir/util.rs\n\n/p/my\\ dir/lib.rs:\n",
        ),
        ["/p/my dir/lib.rs", "/p/my dir/util.rs"],
    );
});

test("keeps the drive colon of a Windows path", () => {
    assert.deepEqual(
        parseDepInfo(
            "C:\\t\\out.wasm: C:\\p\\src\\lib.rs C:\\p\\src\\util.rs\r\n",
        ),
        ["C:\\p\\src\\lib.rs", "C:\\p\\src\\util.rs"],
    );
});

test("skips comment lines and gives nothing for an empty file", () => {
    assert.deepEqual(parseDepInfo("# env-dep:X\n/t/o: /p/a.rs\n"), ["/p/a.rs"]);
    assert.deepEqual(parseDepInfo(""), []);
});

test("drops cargo home, rustup home and target folder files", () => {
    const root = tempDir("rs-local-");
    const at = (...parts) => path.join(root, ...parts);
    withEnv({ CARGO_HOME: at("cargo"), RUSTUP_HOME: at("rustup") }, () => {
        assert.deepEqual(
            localSources(
                [
                    at("p", "src", "util.rs"),
                    at("cargo", "registry", "src", "x", "lib.rs"),
                    at("rustup", "toolchains", "core", "lib.rs"),
                    at("target", "build", "out", "gen.rs"),
                    at("p", "src", "..", "src", "util.rs"),
                    at("dep", "lib.rs"),
                ],
                at("target"),
            ),
            [at("dep", "lib.rs"), at("p", "src", "util.rs")],
        );
    });
    fs.rmSync(root, { recursive: true, force: true });
});

test("depInfoPathFor reads the dep-info file from the given target folder", () => {
    const dir = tempDir("rs-depinfo-");
    try {
        fs.writeFileSync(
            path.join(dir, "Cargo.toml"),
            '[package]\nname = "two-entries"\n\n[lib]\ncrate-type = ["cdylib"]\n',
        );
        assert.equal(
            depInfoPathFor(dir, path.join(dir, "shared")),
            path.join(
                dir,
                "shared",
                "wasm32-unknown-unknown",
                "release",
                "two_entries.d",
            ),
        );
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test("records the local sources of a build, without the entry", () => {
    const project = tempDir("rs-record-p-");
    const build = tempDir("rs-record-b-");
    const entry = path.join(project, "lib.rs");
    const util = path.join(project, "my dir", "util.rs");
    fs.writeFileSync(
        path.join(build, "Cargo.toml"),
        '[package]\nname = "my-crate"\n\n[lib]\npath = "x.rs"\n',
    );
    const target = path.join(build, "target");
    const depInfo = depInfoPathFor(build, target);
    assert.equal(path.basename(depInfo), "my_crate.d");
    assert.deepEqual(recordedSources(entry), []);
    assert.deepEqual(recordSources(entry, build, target), []);

    fs.mkdirSync(path.dirname(depInfo), { recursive: true });
    fs.writeFileSync(
        depInfo,
        `${build}/out.wasm: ${entry} \\\n ${util.replaceAll(" ", "\\ ")} \\\n ${path.join(target, "gen.rs")}\n`,
    );
    assert.deepEqual(recordSources(entry, build, target), [util]);
    assert.deepEqual(recordedSources(entry), [util]);
    fs.rmSync(recordPathFor(entry), { force: true });
    [project, build].forEach((dir) =>
        fs.rmSync(dir, { recursive: true, force: true }),
    );
});

test("reads a damaged record as no record", () => {
    const entry = path.join(tempDir("rs-damaged-"), "lib.rs");
    fs.writeFileSync(recordPathFor(entry), "{not json");
    assert.deepEqual(recordedSources(entry), []);
    fs.rmSync(recordPathFor(entry), { force: true });
});
