const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const spawnWasmPack = require("./spawnWasmPack.util");
const { CRATE, skip } = require("../../test/helpers");

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
    assert.equal(
        fs.existsSync(path.join(await buildInto({}), "math.d.ts")),
        false,
    );
});

test("emits the .d.ts when typescript is true", { skip }, async () => {
    assert.equal(
        fs.existsSync(
            path.join(await buildInto({ typescript: true }), "math.d.ts"),
        ),
        true,
    );
});
