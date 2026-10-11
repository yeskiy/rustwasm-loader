const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const cargoTarget = require("./utils/cargoTarget.util");

// CI sets this to a cache root that `sudo` gave to another user.
const prepared = process.env.RWL_FOREIGN_CACHE_ROOT;
const skip = prepared ? false : "RWL_FOREIGN_CACHE_ROOT is not set";

test("a cache root of another user stops the build", { skip }, () => {
    assert.equal(
        path.resolve(prepared),
        path.join(os.tmpdir(), "rust-wasmpack-loader"),
    );
    assert.notEqual(fs.lstatSync(prepared).uid, process.getuid());
    assert.throws(
        () => cargoTarget.ensurePrivateFolder(prepared),
        /belongs to another user/,
    );
    assert.throws(() => cargoTarget.cacheRoot(), /belongs to another user/);
});

test(
    "a build of an entry stops before it writes to that root",
    { skip },
    () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rs-foreign-"));
        try {
            fs.writeFileSync(
                path.join(dir, "Cargo.toml"),
                '[package]\nname = "probe"\n\n[lib]\ncrate-type = ["cdylib"]\n',
            );
            assert.throws(
                () =>
                    cargoTarget.targetFolderFor(
                        path.join(dir, "lib.rs"),
                        dir,
                        dir,
                    ),
                /belongs to another user/,
            );
            // The mode stays, so the loader did not chmod the folder of another user.
            assert.equal(fs.lstatSync(prepared).mode % 0o1000, 0o700);
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    },
);
