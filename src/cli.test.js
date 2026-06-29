const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const findWasmPack = require("./utils/findWasmPack.util");

const BIN = path.join(__dirname, "..", "bin", "rust-wasmpack-loader.js");
const CRATE = path.join(__dirname, "..", "example", "typed-imports");

const skip = (() => {
    try {
        findWasmPack();
        return false;
    } catch {
        return "wasm-pack is not installed";
    }
})();

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

// An isolated copy of the example crate with a unique marker, so each test owns
// its own content-addressed build dir and sidecar even when files run in parallel.
function isolatedCrate() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rs-cli-"));
    ["Cargo.toml", "Cargo.lock", "math.rs"].forEach((file) =>
        fs.copyFileSync(path.join(CRATE, file), path.join(dir, file)),
    );
    fs.appendFileSync(
        path.join(dir, "math.rs"),
        `\n// ${path.basename(dir)}\n`,
    );
    return dir;
}

test("gen-types writes a sidecar and exits 0", { skip }, () => {
    const dir = isolatedCrate();
    try {
        const result = spawnSync(
            process.execPath,
            [BIN, "gen-types", "math.rs"],
            { cwd: dir, encoding: "utf8" },
        );
        assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
        assert.match(
            fs.readFileSync(path.join(dir, "math.d.rs.ts"), "utf8"),
            /fibonacci\(n: number\): number;/,
        );
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test("--watch regenerates the sidecar on source change", { skip }, async () => {
    const dir = isolatedCrate();
    const rs = path.join(dir, "math.rs");
    const sidecar = path.join(dir, "math.d.rs.ts");

    const child = spawn(
        process.execPath,
        [BIN, "gen-types", "math.rs", "--watch"],
        { cwd: dir },
    );
    const chunks = [];
    const collect = (data) => chunks.push(data.toString());
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    const output = () => chunks.join("");

    try {
        // Wait until the watcher is actually registered before mutating, so the
        // change cannot land in the window between the initial build and the watch.
        assert.ok(
            await waitFor(() => output().includes("watching"), 120000),
            `watcher never became ready:\n${output()}`,
        );
        fs.appendFileSync(
            rs,
            "\n#[wasm_bindgen]\npub fn added() -> i32 {\n    7\n}\n",
        );
        assert.ok(
            await waitFor(
                () =>
                    fs.existsSync(sidecar) &&
                    /added\(\): number;/.test(fs.readFileSync(sidecar, "utf8")),
                120000,
            ),
            `watch did not pick up the new export:\n${output()}`,
        );
    } finally {
        child.kill("SIGKILL");
        await Promise.race([
            new Promise((resolve) => {
                child.once("exit", resolve);
            }),
            new Promise((resolve) => {
                setTimeout(resolve, 5000);
            }),
        ]);
        // Windows can hold the directory briefly after the child exits.
        await waitFor(() => {
            try {
                fs.rmSync(dir, { recursive: true, force: true });
                return true;
            } catch {
                return false;
            }
        }, 10000);
    }
});
