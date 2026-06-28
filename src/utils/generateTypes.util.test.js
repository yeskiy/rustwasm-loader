const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const generateTypes = require("./generateTypes.util");
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

// An isolated copy of the example crate with a unique marker, so this test never
// shares the content-addressed wasm-pack build dir or the sidecar with another.
function isolatedCrate() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rs-gen-"));
    ["Cargo.toml", "Cargo.lock", "math.rs"].forEach((file) =>
        fs.copyFileSync(path.join(CRATE, file), path.join(dir, file)),
    );
    fs.appendFileSync(
        path.join(dir, "math.rs"),
        `\n// ${path.basename(dir)}\n`,
    );
    return dir;
}

test(
    "writes a sidecar with the precise function signatures",
    { skip },
    async () => {
        const dir = isolatedCrate();
        try {
            const out = await generateTypes(path.join(dir, "math.rs"));
            assert.equal(out, path.join(dir, "math.d.rs.ts"));
            const content = fs.readFileSync(out, "utf8");
            assert.match(content, /fibonacci\(n: number\): number;/);
            assert.match(content, /cap\(s: string\): string;/);
            assert.doesNotMatch(content, /Point|initSync|\[key: string\]/);
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    },
);
