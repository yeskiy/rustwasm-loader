const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const pack = require("./pack");
const findWasmPack = require("./utils/findWasmPack.util");

const CRATE = path.join(__dirname, "..", "example", "typed-imports");

const skip = (() => {
    try {
        findWasmPack();
        return false;
    } catch {
        return "wasm-pack is not installed";
    }
})();

const noop = () => undefined;

// An isolated copy of the example crate with a unique marker, so this test never
// shares the content-addressed build dir or the sidecar with another.
function isolatedCrate() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rs-pack-types-"));
    ["Cargo.toml", "Cargo.lock", "math.rs"].forEach((file) =>
        fs.copyFileSync(path.join(CRATE, file), path.join(dir, file)),
    );
    fs.appendFileSync(
        path.join(dir, "math.rs"),
        `\n// ${path.basename(dir)}\n`,
    );
    return dir;
}

// Node inline build params (bundle the wasm bytes into the JS). Both runs share
// one buildFolder so the second is a wasm-pack cache hit: the wasm binary is
// byte-for-byte the same and the only variable left is the typings flag.
function packParams(dir, emitTypes) {
    return {
        resourcePath: path.join(dir, "math.rs"),
        baseFolder: dir,
        buildFolder: path.join(dir, "build"),
        wasmName: "out.wasm",
        target: "node",
        logLevel: "error",
        web: {
            asyncLoading: false,
            usePublicPath: false,
            publicPath: [],
            wasmPathModifier: ["/"],
        },
        node: { bundle: true },
        emitTypes,
    };
}

test(
    "emitTypes writes the sidecar as a pure side effect of the same build",
    { skip },
    async () => {
        const dir = isolatedCrate();
        const sidecar = path.join(dir, "math.d.rs.ts");
        try {
            fs.mkdirSync(path.join(dir, "build"), { recursive: true });

            const glueOff = await pack(packParams(dir, false), noop);
            assert.equal(
                fs.existsSync(sidecar),
                false,
                "emitTypes:false must not write a sidecar",
            );

            const glueOn = await pack(packParams(dir, true), noop);
            assert.ok(
                fs.existsSync(sidecar),
                "emitTypes:true must write the sidecar",
            );
            const content = fs.readFileSync(sidecar, "utf8");
            assert.match(content, /fibonacci\(n: number\): number;/);
            assert.match(content, /cap\(s: string\): string;/);
            assert.doesNotMatch(content, /Point|initSync|\[key: string\]/);

            // The returned module is a function of the source alone: emission is a
            // side effect, never a change to what consumers import.
            assert.equal(glueOn, glueOff);
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    },
);
