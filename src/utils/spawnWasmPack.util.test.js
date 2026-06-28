const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const spawnWasmPack = require("./spawnWasmPack.util");
const findWasmPack = require("./findWasmPack.util");

const CRATE = path.join(__dirname, "..", "..", "example", "typed-imports");

const skip = (() => {
    try {
        findWasmPack();
        return false;
    } catch {
        return "wasm-pack is not installed";
    }
})();

async function buildInto(extra) {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "rs-tsopt-"));
    await spawnWasmPack({
        cwd: CRATE,
        outDir,
        outName: "math",
        args: ["--log-level", "error"],
        extraArgs: ["--target", "web"],
        ...extra,
    });
    return outDir;
}

test("omits the .d.ts by default", { skip }, async () => {
    const outDir = await buildInto({});
    assert.equal(fs.existsSync(path.join(outDir, "math.d.ts")), false);
});

test("emits the .d.ts when typescript is true", { skip }, async () => {
    const outDir = await buildInto({ typescript: true });
    assert.equal(fs.existsSync(path.join(outDir, "math.d.ts")), true);
});
