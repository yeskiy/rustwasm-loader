const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const findWasmPack = require("../src/utils/findWasmPack.util");
const { sharedTargetFolderOf } = require("../src/utils/cargoTarget.util");

const CRATE = path.join(__dirname, "..", "example", "typed-imports");

const hasWasmPack = (() => {
    try {
        findWasmPack();
        return true;
    } catch {
        return false;
    }
})();

// The skip reason for tests that run a real wasm-pack build.
const skip = hasWasmPack ? false : "wasm-pack is not installed";

const tempDir = (prefix) =>
    fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));

// A copy of the example crate. The marker gives each copy its own
// content-addressed build dir and sidecar.
function isolatedCrate(prefix, { marker = true, buildFolder = false } = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    ["Cargo.toml", "Cargo.lock", "math.rs"].forEach((file) =>
        fs.copyFileSync(path.join(CRATE, file), path.join(dir, file)),
    );
    if (marker) {
        fs.appendFileSync(
            path.join(dir, "math.rs"),
            `\n// ${path.basename(dir)}\n`,
        );
    }
    if (buildFolder) {
        fs.mkdirSync(path.join(dir, "build"), { recursive: true });
    }
    return dir;
}

// Removes a temp crate and the shared cargo target folder of its manifest.
// A set CARGO_TARGET_DIR belongs to the user, so its folder stays.
function removeCrate(dir) {
    if (!process.env.CARGO_TARGET_DIR) {
        fs.rmSync(sharedTargetFolderOf(dir), { recursive: true, force: true });
    }
    fs.rmSync(dir, { recursive: true, force: true });
}

function waitFor(predicate, timeoutMs, intervalMs = 250) {
    const start = Date.now();
    const attempt = async () => {
        if (await predicate()) return true;
        if (Date.now() - start > timeoutMs) return false;
        await new Promise((resolve) => {
            setTimeout(resolve, intervalMs);
        });
        return attempt();
    };
    return attempt();
}

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

// A buildable crate with one function, for the Next.js pre-build tests.
const PROBE_SOURCE = "pub fn fib(n: u32) -> u32 { n }\n";

const PROBE_MANIFEST = [
    "[package]",
    'name = "probe"',
    'version = "0.1.0"',
    "",
    "[lib]",
    'crate-type = ["cdylib"]',
    'path = "lib.rs"',
    "",
    "[dependencies]",
    'wasm-bindgen = "0.2.95"',
    "",
].join("\n");

// The sidecar of the example crate: precise signatures, no init declarations.
function assertSidecar(content) {
    assert.match(content, /fibonacci\(n: number\): number;/);
    assert.match(content, /cap\(s: string\): string;/);
    assert.match(content, /declare class Point \{/);
    assert.match(content, /Point: typeof Point;/);
    assert.doesNotMatch(content, /initSync|\[key: string\]/);
}

// A node inline build of the example crate into `<dir>/build`.
const packParams = (dir, overrides) => ({
    resourcePath: path.join(dir, "math.rs"),
    baseFolder: dir,
    buildFolder: path.join(dir, "build"),
    wasmName: "out.wasm",
    target: "node",
    logLevel: "error",
    web: { asyncLoading: false, publicPath: "", wasmPathModifier: ["/"] },
    node: { bundle: true },
    ...overrides,
});

module.exports = {
    CRATE,
    PROBE_MANIFEST,
    PROBE_SOURCE,
    assertSidecar,
    isolatedCrate,
    packParams,
    removeCrate,
    skip,
    tempDir,
    waitFor,
    withEnv,
};
