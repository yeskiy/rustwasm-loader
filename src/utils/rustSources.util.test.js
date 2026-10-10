const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
    parseDepInfo,
    localSources,
    depInfoPathFor,
    recordPathFor,
    recordedSources,
    recordSources,
    targetFolderFor,
} = require("./rustSources.util");

const tempDir = (prefix) =>
    fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));

// An undefined value removes the variable.
const setEnv = (vars) =>
    Object.entries(vars).forEach(([key, value]) => {
        if (value === undefined) {
            delete process.env[key];
        } else {
            process.env[key] = value;
        }
    });

const withEnv = (vars, run) => {
    const saved = Object.fromEntries(
        Object.keys(vars).map((key) => [key, process.env[key]]),
    );
    setEnv(vars);
    try {
        return run();
    } finally {
        setEnv(saved);
    }
};

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

test("resolves the target folder from CARGO_TARGET_DIR", () => {
    withEnv({ CARGO_TARGET_DIR: undefined }, () => {
        assert.equal(
            targetFolderFor(path.resolve("/b")),
            path.resolve("/b/target"),
        );
    });
    withEnv({ CARGO_TARGET_DIR: "shared" }, () => {
        assert.equal(
            targetFolderFor(path.resolve("/b")),
            path.resolve("/b/shared"),
        );
    });
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
    withEnv({ CARGO_TARGET_DIR: undefined }, () => {
        const depInfo = depInfoPathFor(build);
        assert.equal(path.basename(depInfo), "my_crate.d");
        assert.deepEqual(recordedSources(entry), []);
        assert.deepEqual(recordSources(entry, build), []);

        fs.mkdirSync(path.dirname(depInfo), { recursive: true });
        fs.writeFileSync(
            depInfo,
            `${build}/out.wasm: ${entry} \\\n ${util.replaceAll(" ", "\\ ")}\n`,
        );
        assert.deepEqual(recordSources(entry, build), [util]);
        assert.deepEqual(recordedSources(entry), [util]);
    });
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
