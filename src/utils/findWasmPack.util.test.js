const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");
const which = require("which");
const findWasmPack = require("./findWasmPack.util");

const CARGO_BIN = path.join(os.homedir(), ".cargo", "bin", "wasm-pack");

// Runs `findWasmPack` against a host the test describes: the `WASM_PACK_PATH`
// value, the result of the PATH lookup, the presence of `binary-install`, and
// the set of files on disk. Every stub goes back after the call.
function onHost({ env, inPath, binaryInstall, files = [] }, run) {
    const originalEnv = process.env.WASM_PACK_PATH;
    const originalWhich = which.sync;
    const originalExists = fs.existsSync;
    const originalResolve = Module._resolveFilename;

    if (env === undefined) {
        delete process.env.WASM_PACK_PATH;
    } else {
        process.env.WASM_PACK_PATH = env;
    }
    which.sync = () => inPath ?? null;
    fs.existsSync = (target) => files.includes(target);
    Module._resolveFilename = function resolveFilename(request, ...rest) {
        if (request === "binary-install") {
            if (!binaryInstall) {
                const error = new Error("Cannot find module 'binary-install'");
                error.code = "MODULE_NOT_FOUND";
                throw error;
            }
            return binaryInstall;
        }
        return originalResolve.call(this, request, ...rest);
    };

    try {
        return run();
    } finally {
        if (originalEnv === undefined) {
            delete process.env.WASM_PACK_PATH;
        } else {
            process.env.WASM_PACK_PATH = originalEnv;
        }
        which.sync = originalWhich;
        fs.existsSync = originalExists;
        Module._resolveFilename = originalResolve;
    }
}

const binaryInstallBin = (entry) =>
    path.join(entry, "..", "node_modules", ".bin", "wasm-pack.exe");

test("WASM_PACK_PATH wins over every other candidate", () => {
    assert.equal(
        onHost({ env: "/custom/wasm-pack", inPath: "/usr/bin/wasm-pack" }, () =>
            findWasmPack(),
        ),
        "/custom/wasm-pack",
    );
});

test("the PATH lookup comes before the package candidates", () => {
    assert.equal(
        onHost({ inPath: "/usr/bin/wasm-pack", files: [CARGO_BIN] }, () =>
            findWasmPack(),
        ),
        "/usr/bin/wasm-pack",
    );
});

test("uses the binary-install location when that package is installed", () => {
    const entry = path.join(
        "/repo",
        "node_modules",
        "binary-install",
        "index.js",
    );
    assert.equal(
        onHost(
            {
                binaryInstall: entry,
                files: [binaryInstallBin(entry), CARGO_BIN],
            },
            () => findWasmPack(),
        ),
        binaryInstallBin(entry),
    );
});

test("falls through to the cargo bin when binary-install is absent", () => {
    assert.equal(
        onHost({ files: [CARGO_BIN] }, () => findWasmPack()),
        CARGO_BIN,
    );
});

test("names wasm-pack when no candidate is found", () => {
    assert.throws(
        () => onHost({}, () => findWasmPack()),
        (error) => {
            assert.match(error.message, /wasm-pack/);
            assert.match(error.message, /WASM_PACK_PATH/);
            assert.doesNotMatch(error.message, /binary-install/);
            assert.doesNotMatch(error.message, /Cannot find module/);
            return true;
        },
    );
});
