const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { parse, stringify } = require("smol-toml");
const {
    rewritePaths,
    findWorkspaceRoot,
    inheritWorkspace,
    resolveManifest,
    pathDependencyFolders,
    cargoInputsFor,
} = require("./cargoManifest.util");
const { tempDir } = require("../../test/helpers");

// smol-toml builds objects without a prototype, and deepEqual compares prototypes.
const plain = (value) => JSON.parse(JSON.stringify(value));

const posix = (...parts) =>
    path
        .resolve(...parts)
        .split(path.sep)
        .join(path.posix.sep);

// Writes `files` (relative path to content) under a new temp folder.
function tree(files) {
    const dir = tempDir("rs-manifest-");
    Object.entries(files).forEach(([file, content]) => {
        fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
        fs.writeFileSync(path.join(dir, file), content);
    });
    return dir;
}

const withTree = (files, run) => {
    const dir = tree(files);
    try {
        return run(dir);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
};

const WORKSPACE = {
    "Cargo.toml": [
        "[workspace]",
        'members = ["crates/*"]',
        'exclude = ["crates/outside"]',
        'resolver = "2"',
        "",
        "[workspace.package]",
        'version = "0.3.0"',
        'edition = "2021"',
        'readme = "README.md"',
        "",
        "[workspace.dependencies]",
        'wasm-bindgen = { version = "0.2.95", features = ["serde"] }',
        'log = "0.4"',
        'shared = { path = "crates/shared" }',
        "",
        "[workspace.lints.rust]",
        'unsafe_code = "forbid"',
        "",
        "[patch.crates-io]",
        'log = { path = "vendor/log" }',
        "",
        "[profile.release]",
        'opt-level = "s"',
        "",
    ].join("\n"),
    "Cargo.lock": "# workspace lock\nversion = 4\n",
    "crates/app/Cargo.toml": [
        "[package]",
        'name = "app"',
        "version.workspace = true",
        "edition.workspace = true",
        "readme.workspace = true",
        "",
        "[lib]",
        'crate-type = ["cdylib"]',
        "",
        "[dependencies]",
        'wasm-bindgen = { workspace = true, features = ["std"], optional = true }',
        "log.workspace = true",
        "shared.workspace = true",
        'helper = { path = "../helper" }',
        "",
        "[lints]",
        "workspace = true",
        "",
        "[profile.release]",
        'opt-level = "z"',
        "",
    ].join("\n"),
    "crates/shared/Cargo.toml":
        '[package]\nname = "shared"\nversion = "0.1.0"\n\n[dependencies]\nhelper = { path = "../helper" }\n',
    "crates/helper/Cargo.toml":
        '[package]\nname = "helper"\nversion = "0.1.0"\n\n[dependencies]\nshared = { path = "../shared" }\n',
    "crates/outside/Cargo.toml":
        '[package]\nname = "outside"\nversion = "0.1.0"\n',
};

test("rewritePaths resolves every relative path against the manifest folder", () => {
    withTree({}, (dir) => {
        const manifest = rewritePaths(
            {
                package: {
                    name: "a",
                    workspace: "..",
                    build: "tools/build.rs",
                    readme: "../README.md",
                },
                dependencies: { up: { path: ".." }, remote: "1.0" },
                "dev-dependencies": { dev: { path: "dev" } },
                "build-dependencies": { gen: { path: "../gen" } },
                target: {
                    'cfg(target_arch = "wasm32")': {
                        dependencies: { web: { path: "web" } },
                    },
                },
                patch: { "crates-io": { log: { path: "vendor/log" } } },
                replace: { "foo:0.1.0": { path: "foo" } },
                bin: [{ name: "cli", path: "bin/cli.rs" }, { name: "auto" }],
                example: [{ name: "demo", path: "demo.rs" }],
                test: [{ name: "it", path: "it.rs" }],
                bench: [{ name: "speed", path: "speed.rs" }],
                lib: { path: "lib.rs" },
            },
            dir,
        );
        assert.deepEqual(manifest.package, {
            name: "a",
            build: posix(dir, "tools/build.rs"),
            readme: posix(dir, "../README.md"),
        });
        assert.deepEqual(manifest.dependencies, {
            up: { path: posix(dir, "..") },
            remote: "1.0",
        });
        assert.equal(manifest["dev-dependencies"].dev.path, posix(dir, "dev"));
        assert.equal(
            manifest["build-dependencies"].gen.path,
            posix(dir, "../gen"),
        );
        assert.equal(
            manifest.target['cfg(target_arch = "wasm32")'].dependencies.web
                .path,
            posix(dir, "web"),
        );
        assert.equal(
            manifest.patch["crates-io"].log.path,
            posix(dir, "vendor/log"),
        );
        assert.equal(manifest.replace["foo:0.1.0"].path, posix(dir, "foo"));
        assert.deepEqual(manifest.bin, [
            { name: "cli", path: posix(dir, "bin/cli.rs") },
            { name: "auto" },
        ]);
        assert.equal(manifest.example[0].path, posix(dir, "demo.rs"));
        assert.equal(manifest.test[0].path, posix(dir, "it.rs"));
        assert.equal(manifest.bench[0].path, posix(dir, "speed.rs"));
        assert.deepEqual(manifest.lib, { path: "lib.rs" });
    });
});

test("rewritePaths keeps a build.rs next to the manifest", () => {
    withTree({ "build.rs": "fn main() {}\n" }, (dir) => {
        assert.equal(
            rewritePaths({ package: { name: "a" } }, dir).package.build,
            posix(dir, "build.rs"),
        );
        assert.equal(
            rewritePaths({ package: { name: "a", build: false } }, dir).package
                .build,
            false,
        );
    });
});

test("findWorkspaceRoot finds the nearest root that lists the crate", () => {
    withTree(WORKSPACE, (dir) => {
        const app = path.join(dir, "crates", "app");
        assert.equal(
            findWorkspaceRoot(
                app,
                parse(fs.readFileSync(path.join(app, "Cargo.toml"), "utf8")),
            ).folder,
            dir,
        );
        const outside = path.join(dir, "crates", "outside");
        assert.equal(findWorkspaceRoot(outside, { package: {} }), null);
    });
});

test("findWorkspaceRoot follows package.workspace and the root package", () => {
    withTree(
        {
            "root/Cargo.toml": '[workspace]\nmembers = ["../far"]\n',
            "far/Cargo.toml":
                '[package]\nname = "far"\nworkspace = "../root"\n',
            "self/Cargo.toml": '[package]\nname = "self"\n\n[workspace]\n',
            "lone/Cargo.toml": '[package]\nname = "lone"\n',
        },
        (dir) => {
            const far = path.join(dir, "far");
            assert.equal(
                findWorkspaceRoot(far, { package: { workspace: "../root" } })
                    .folder,
                path.join(dir, "root"),
            );
            const own = path.join(dir, "self");
            assert.equal(
                findWorkspaceRoot(own, { package: {}, workspace: {} }).folder,
                own,
            );
            assert.equal(
                findWorkspaceRoot(path.join(dir, "lone"), { package: {} }),
                null,
            );
        },
    );
});

test("findWorkspaceRoot counts a path dependency of the root package as a member", () => {
    withTree(
        {
            "Cargo.toml":
                '[package]\nname = "top"\n\n[workspace]\n\n[dependencies]\nsub = { path = "sub" }\n',
            "sub/Cargo.toml": '[package]\nname = "sub"\n',
        },
        (dir) => {
            assert.equal(
                findWorkspaceRoot(path.join(dir, "sub"), { package: {} })
                    .folder,
                dir,
            );
        },
    );
});

test("inheritWorkspace fills the fields and dependencies of the workspace", () => {
    withTree(WORKSPACE, (dir) => {
        const root = parse(WORKSPACE["Cargo.toml"]);
        const manifest = inheritWorkspace(
            parse(WORKSPACE["crates/app/Cargo.toml"]),
            root.workspace,
            dir,
        );
        assert.deepEqual(manifest.package, {
            name: "app",
            version: "0.3.0",
            edition: "2021",
            readme: posix(dir, "README.md"),
        });
        assert.deepEqual(manifest.dependencies["wasm-bindgen"], {
            version: "0.2.95",
            features: ["serde", "std"],
            optional: true,
        });
        assert.deepEqual(manifest.dependencies.log, { version: "0.4" });
        assert.deepEqual(manifest.dependencies.shared, {
            path: posix(dir, "crates/shared"),
        });
        assert.deepEqual(plain(manifest.dependencies.helper), {
            path: "../helper",
        });
        assert.deepEqual(plain(manifest.lints), {
            rust: { unsafe_code: "forbid" },
        });
    });
});

test("inheritWorkspace names a field that the workspace does not define", () => {
    assert.throws(
        () =>
            inheritWorkspace(
                { package: { license: { workspace: true } } },
                {},
                "/ws",
            ),
        /"license" is not in \[workspace\.package\]/,
    );
    assert.throws(
        () =>
            inheritWorkspace(
                { dependencies: { serde: { workspace: true } } },
                { dependencies: {} },
                "/ws",
            ),
        /"serde" is not in \[workspace\.dependencies\]/,
    );
});

test("resolveManifest makes a member its own root with the root-only sections", () => {
    withTree(WORKSPACE, (dir) => {
        const { manifest, rootFolder } = resolveManifest(
            path.join(dir, "crates", "app"),
        );
        assert.equal(rootFolder, dir);
        assert.deepEqual(manifest.workspace, { resolver: "2" });
        assert.deepEqual(plain(manifest.profile), {
            release: { "opt-level": "s" },
        });
        assert.equal(
            manifest.patch["crates-io"].log.path,
            posix(dir, "vendor/log"),
        );
        assert.equal(
            manifest.dependencies.helper.path,
            posix(dir, "crates/helper"),
        );
    });
});

test("resolveManifest keeps a crate outside a workspace as it is", () => {
    withTree(
        {
            "Cargo.toml":
                '[package]\nname = "solo"\n\n[dependencies]\nup = { path = ".." }\n\n[profile.release]\nlto = true\n',
        },
        (dir) => {
            const { manifest, rootFolder } = resolveManifest(dir);
            assert.equal(rootFolder, null);
            assert.deepEqual(plain(manifest), {
                package: { name: "solo" },
                dependencies: { up: { path: posix(dir, "..") } },
                profile: { release: { lto: true } },
                workspace: {},
            });
        },
    );
});

test("smol-toml round-trips a cfg target table, an empty workspace and bin targets", () => {
    const manifest = {
        package: { name: "a", description: 'says "hi"' },
        target: {
            'cfg(target_arch = "wasm32")': {
                dependencies: { web: { path: "C:/web" } },
            },
        },
        bin: [{ name: "one", path: "one.rs" }, { name: "two" }],
        workspace: {},
    };
    const text = stringify(manifest);
    assert.match(text, /^\[workspace\]$/m);
    assert.match(text, /^\[\[bin\]\]$/m);
    assert.deepEqual(plain(parse(text)), manifest);
});

test("pathDependencyFolders follows path dependencies and stops at a cycle", () => {
    withTree(WORKSPACE, (dir) => {
        assert.deepEqual(
            pathDependencyFolders(path.join(dir, "crates", "app")).sort(),
            [
                path.join(dir, "crates", "helper"),
                path.join(dir, "crates", "shared"),
            ],
        );
    });
});

test("cargoInputsFor gives a member the workspace lock and manifests", () => {
    withTree(WORKSPACE, (dir) => {
        assert.deepEqual(cargoInputsFor(path.join(dir, "crates", "app")), {
            lock: path.join(dir, "Cargo.lock"),
            manifests: [
                path.join(dir, "Cargo.toml"),
                path.join(dir, "crates", "helper", "Cargo.toml"),
                path.join(dir, "crates", "shared", "Cargo.toml"),
            ],
        });
        const outside = path.join(dir, "crates", "outside");
        assert.deepEqual(cargoInputsFor(outside), {
            lock: path.join(outside, "Cargo.lock"),
            manifests: [],
        });
    });
});
