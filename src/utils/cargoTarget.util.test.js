const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const cargoTarget = require("./cargoTarget.util");
const { removeCrate, tempDir, withEnv } = require("../../test/helpers");

const posixOnly = { skip: process.platform === "win32" };

const crate = (dir, libPath) => {
    fs.writeFileSync(
        path.join(dir, "Cargo.toml"),
        `[package]\nname = "two-entries"\n\n[lib]\ncrate-type = ["cdylib"]\n${
            libPath ? `path = "${libPath}"\n` : ""
        }`,
    );
};

test("entries of one manifest share one target folder", () => {
    const dir = tempDir("rs-target-");
    withEnv({ CARGO_TARGET_DIR: undefined }, () => {
        try {
            crate(dir);
            const a = cargoTarget.targetFolderFor(
                path.join(dir, "a.rs"),
                dir,
                path.join(dir, "x"),
            );
            assert.equal(
                a,
                cargoTarget.targetFolderFor(
                    path.join(dir, "b.rs"),
                    dir,
                    path.join(dir, "y"),
                ),
            );
            assert.equal(a, cargoTarget.sharedTargetFolderOf(dir));
            assert.ok(a.startsWith(cargoTarget.cacheRoot()));
        } finally {
            removeCrate(dir);
        }
    });
});

test("two manifests get two target folders", () => {
    const one = tempDir("rs-target-");
    const two = tempDir("rs-target-");
    withEnv({ CARGO_TARGET_DIR: undefined }, () => {
        try {
            crate(one);
            crate(two);
            assert.notEqual(
                cargoTarget.targetFolderFor(path.join(one, "a.rs"), one, one),
                cargoTarget.targetFolderFor(path.join(two, "a.rs"), two, two),
            );
        } finally {
            [one, two].forEach((dir) => removeCrate(dir));
        }
    });
});

test("CARGO_TARGET_DIR wins and resolves against the build folder", () => {
    const dir = tempDir("rs-target-");
    try {
        crate(dir);
        withEnv({ CARGO_TARGET_DIR: "shared" }, () => {
            assert.equal(
                cargoTarget.targetFolderFor(
                    path.join(dir, "a.rs"),
                    dir,
                    path.join(dir, "b1"),
                ),
                path.join(dir, "b1", "shared"),
            );
        });
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test("a new private folder has mode 0o700", posixOnly, () => {
    const dir = tempDir("rs-target-");
    try {
        const folder = cargoTarget.ensurePrivateFolder(path.join(dir, "root"));
        assert.equal(fs.statSync(folder).mode % 0o1000, 0o700);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test(
    "a folder of the current user with wider bits gets mode 0o700",
    posixOnly,
    () => {
        const dir = tempDir("rs-target-");
        try {
            const folder = path.join(dir, "root");
            fs.mkdirSync(folder);
            // The umask can remove bits at creation, so set the mode explicitly.
            fs.chmodSync(folder, 0o755);
            cargoTarget.ensurePrivateFolder(folder);
            assert.equal(fs.statSync(folder).mode % 0o1000, 0o700);
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    },
);

test("a symlinked folder stops the build", () => {
    const dir = tempDir("rs-target-");
    const link = path.join(dir, "link");
    try {
        fs.mkdirSync(path.join(dir, "real"));
        // A junction needs no privilege on Windows. It points at a sibling, not an ancestor.
        fs.symlinkSync(path.join(dir, "real"), link, "junction");
        assert.throws(() => cargoTarget.ensurePrivateFolder(link), /symlink/);
    } finally {
        fs.rmSync(link, { force: true });
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test(
    "a folder of another user stops the build",
    { skip: typeof process.getuid !== "function" },
    (t) => {
        const dir = tempDir("rs-target-");
        const realGetuid = process.getuid;
        t.after(() => {
            process.getuid = realGetuid;
            fs.rmSync(dir, { recursive: true, force: true });
        });
        process.getuid = () => realGetuid() + 1;
        assert.throws(
            () => cargoTarget.ensurePrivateFolder(path.join(dir, "root")),
            /another user/,
        );
    },
);

test("the marker matches only the same inputs and the same output file", () => {
    const dir = tempDir("rs-target-");
    try {
        const wasm = path.join(dir, "crate.wasm");
        assert.equal(cargoTarget.markerMatches(wasm, "hash-1"), false);
        fs.writeFileSync(wasm, "one");
        cargoTarget.writeMarker(wasm, "hash-1");
        assert.equal(cargoTarget.markerMatches(wasm, "hash-1"), true);
        assert.equal(cargoTarget.markerMatches(wasm, "hash-2"), false);
        fs.writeFileSync(wasm, "other bytes");
        assert.equal(cargoTarget.markerMatches(wasm, "hash-1"), false);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test("invalidateCrate removes only the fingerprints of the package", () => {
    const dir = tempDir("rs-target-");
    try {
        const prints = path.join(
            dir,
            "wasm32-unknown-unknown",
            "release",
            ".fingerprint",
        );
        [
            "two-entries-0123456789abcdef",
            "two-entries-utils-0123456789abcdef",
            "serde-0123456789abcdef",
        ].forEach((name) =>
            fs.mkdirSync(path.join(prints, name), { recursive: true }),
        );
        cargoTarget.invalidateCrate(dir, "two-entries");
        assert.deepEqual(
            fs.readdirSync(prints).sort((a, b) => a.localeCompare(b)),
            ["serde-0123456789abcdef", "two-entries-utils-0123456789abcdef"],
        );
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test("crateNamesOf reads the package and the lib name", () => {
    const dir = tempDir("rs-target-");
    try {
        crate(dir);
        assert.deepEqual(cargoTarget.crateNamesOf(dir), {
            packageName: "two-entries",
            libName: "two_entries",
        });
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
