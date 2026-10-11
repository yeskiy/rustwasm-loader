const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const prebuildEdgeWasm = require("./nextPrebuild.util");
const edgeWasmPath = require("./edgeCache.util");
const buildInputsHash = require("./buildInputsHash.util");
const {
    PROBE_MANIFEST: MANIFEST,
    PROBE_SOURCE: SOURCE,
    removeCrate,
    tempDir,
} = require("../../test/helpers");

const { scanRsFiles, moduleDeclarations, moduleFiles } = prebuildEdgeWasm;

// A throwaway project: a crate at the root plus the directories a scan has to
// pass over.
function project() {
    const dir = tempDir("rs-prebuild-");
    fs.writeFileSync(path.join(dir, "lib.rs"), SOURCE);
    fs.writeFileSync(path.join(dir, "Cargo.toml"), MANIFEST);
    fs.writeFileSync(path.join(dir, "Cargo.lock"), "version = 4\n");
    ["node_modules", ".next", "target", ".git"].forEach((skipped) => {
        fs.mkdirSync(path.join(dir, skipped));
        fs.writeFileSync(path.join(dir, skipped, "buried.rs"), SOURCE);
    });
    fs.mkdirSync(path.join(dir, "src"));
    fs.writeFileSync(path.join(dir, "src", "extra.rs"), SOURCE);
    return dir;
}

const cleanup = removeCrate;

test("finds the .rs files a project owns", () => {
    const dir = project();
    try {
        assert.deepEqual(scanRsFiles(dir).sort(), [
            path.join(dir, "lib.rs"),
            path.join(dir, "src", "extra.rs"),
        ]);
    } finally {
        cleanup(dir);
    }
});

test("passes over node_modules, .next, target and .git", () => {
    const dir = project();
    try {
        assert.doesNotMatch(scanRsFiles(dir).join("|"), /buried\.rs/);
    } finally {
        cleanup(dir);
    }
});

test("builds nothing when every wasm is already on disk", async () => {
    const dir = project();
    try {
        // A cache hit for the crate file keeps the pre-build away from wasm-pack.
        // The other `.rs` belongs to no crate, so the scan skips it.
        const owned = path.join(dir, "lib.rs");
        const cachePath = edgeWasmPath(
            dir,
            buildInputsHash(fs.readFileSync(owned, "utf8"), owned, dir),
        );
        fs.mkdirSync(path.dirname(cachePath), { recursive: true });
        fs.writeFileSync(cachePath, "seeded");
        assert.deepEqual(await prebuildEdgeWasm(dir, {}), {
            built: [],
            scanned: 2,
        });
    } finally {
        cleanup(dir);
    }
});

test("names the file in the error when a listed one owns no crate", async () => {
    const dir = tempDir("rs-prebuild-bare-");
    try {
        fs.writeFileSync(path.join(dir, "stray.rs"), SOURCE);
        await assert.rejects(
            () => prebuildEdgeWasm(dir, {}, ["stray.rs"]),
            /cannot pre-build .*stray\.rs/,
        );
    } finally {
        cleanup(dir);
    }
});

test("a scan passes over a .rs file that owns no crate", async () => {
    const dir = tempDir("rs-prebuild-stray-");
    try {
        fs.writeFileSync(path.join(dir, "stray.rs"), SOURCE);
        assert.deepEqual(await prebuildEdgeWasm(dir, {}), {
            built: [],
            scanned: 1,
        });
    } finally {
        cleanup(dir);
    }
});

// Writes the given `.rs` files and returns the module files among them,
// relative to the tree root.
function modulesOf(sources) {
    const dir = tempDir("rs-modules-");
    try {
        Object.entries(sources).forEach(([name, source]) => {
            fs.mkdirSync(path.dirname(path.join(dir, name)), {
                recursive: true,
            });
            fs.writeFileSync(path.join(dir, name), source);
        });
        return [
            ...moduleFiles(
                Object.keys(sources).map((name) => path.join(dir, name)),
            ),
        ]
            .map((file) => path.relative(dir, file).replaceAll("\\", "/"))
            .sort();
    } finally {
        cleanup(dir);
    }
}

test("reads plain, visible and attributed module declarations", () => {
    assert.deepEqual(
        moduleDeclarations(
            [
                "mod a;",
                "pub mod b ;",
                "pub(crate) mod c;",
                "pub(in crate::x) mod d;",
                '#[cfg(test)]\n#[path = "other/e.rs"]\npub(super) mod e;',
                "mod r#f;",
            ].join("\n"),
        ),
        [
            { name: "a", path: undefined },
            { name: "b", path: undefined },
            { name: "c", path: undefined },
            { name: "d", path: undefined },
            { name: "e", path: "other/e.rs" },
            { name: "f", path: undefined },
        ],
    );
});

test("ignores inline modules, comments and strings", () => {
    assert.deepEqual(
        moduleDeclarations(
            [
                "// mod a;",
                "/* mod b;\n mod c; */",
                'const S: &str = "mod d;";',
                'const R: &str = r#"mod e; {"#;',
                "const C: char = '{';",
                "mod tests { mod inner; }",
                "fn f() { mod local; }",
                "mod kept;",
            ].join("\n"),
        ),
        [{ name: "kept", path: undefined }],
    );
});

test("skips a plain module file", () => {
    assert.deepEqual(
        modulesOf({ "lib.rs": "mod util;\n", "util.rs": "use crate::x;\n" }),
        ["util.rs"],
    );
});

test("skips a pub(crate) module file", () => {
    assert.deepEqual(
        modulesOf({ "lib.rs": "pub(crate) mod util;\n", "util.rs": "" }),
        ["util.rs"],
    );
});

test("skips the file a #[path] attribute names", () => {
    assert.deepEqual(
        modulesOf({
            "lib.rs": '#[path = "shared/helpers.rs"]\nmod util;\n',
            "shared/helpers.rs": "mod deep;\n",
            "shared/deep.rs": "",
        }),
        ["shared/deep.rs", "shared/helpers.rs"],
    );
});

test("skips a mod.rs module and the modules it declares", () => {
    assert.deepEqual(
        modulesOf({
            "lib.rs": "mod util;\n",
            "util/mod.rs": "mod inner;\n",
            "util/inner.rs": "",
        }),
        ["util/inner.rs", "util/mod.rs"],
    );
});

test("nests through a non-mod-rs file and keeps a real entry", () => {
    assert.deepEqual(
        modulesOf({
            "lib.rs": "mod util;\n",
            "util.rs": "mod inner;\n",
            "util/inner.rs": "",
            // An entry of its own: `mod inner;` in util.rs does not name it.
            "inner.rs": "pub fn g() {}\n",
        }),
        ["util.rs", "util/inner.rs"],
    );
});

test("an entry other than lib.rs owns the modules of its directory", () => {
    assert.deepEqual(modulesOf({ "fib.rs": "mod util;\n", "util.rs": "" }), [
        "util.rs",
    ]);
});

test("keeps files that an inline or commented module only mentions", () => {
    assert.deepEqual(
        modulesOf({
            "lib.rs": "// mod a;\nmod b { }\n",
            "a.rs": "",
            "b.rs": "",
        }),
        [],
    );
});

test("a scan does not build a module file", async () => {
    const dir = project();
    try {
        const owned = path.join(dir, "lib.rs");
        // Without `lib.path`, the crate owns every `.rs` file, util.rs included.
        fs.writeFileSync(
            path.join(dir, "Cargo.toml"),
            MANIFEST.replace('path = "lib.rs"\n', ""),
        );
        fs.rmSync(path.join(dir, "src"), { recursive: true });
        fs.writeFileSync(owned, `mod util;\n${SOURCE}`);
        fs.writeFileSync(path.join(dir, "util.rs"), "use crate::missing;\n");
        // Only lib.rs has its wasm, so a build of util.rs would reach the loader
        // and fail on the missing wasm-pack.
        const cachePath = edgeWasmPath(
            dir,
            buildInputsHash(fs.readFileSync(owned, "utf8"), owned, dir),
        );
        fs.mkdirSync(path.dirname(cachePath), { recursive: true });
        fs.writeFileSync(cachePath, "seeded");
        process.env.WASM_PACK_PATH = path.join(dir, "no-wasm-pack");
        assert.deepEqual(await prebuildEdgeWasm(dir, {}), {
            built: [],
            scanned: 2,
        });
    } finally {
        delete process.env.WASM_PACK_PATH;
        cleanup(dir);
    }
});
