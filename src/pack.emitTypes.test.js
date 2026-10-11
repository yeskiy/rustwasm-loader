const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const pack = require("./pack");
const {
    assertSidecar,
    isolatedCrate,
    packParams,
    removeCrate,
    skip,
} = require("../test/helpers");

const noop = () => undefined;

// Both runs share one build folder, so the wasm binary is the same and the
// typings flag is the only difference.
test(
    "emitTypes writes the sidecar as a pure side effect of the same build",
    { skip },
    async () => {
        const dir = isolatedCrate("rs-pack-types-");
        const sidecar = path.join(dir, "math.d.rs.ts");
        try {
            fs.mkdirSync(path.join(dir, "build"), { recursive: true });

            const glueOff = await pack(
                packParams(dir, { emitTypes: false }),
                noop,
            );
            assert.equal(
                fs.existsSync(sidecar),
                false,
                "emitTypes:false must not write a sidecar",
            );

            const glueOn = await pack(
                packParams(dir, { emitTypes: true }),
                noop,
            );
            assert.ok(
                fs.existsSync(sidecar),
                "emitTypes:true must write the sidecar",
            );
            assertSidecar(fs.readFileSync(sidecar, "utf8"));

            // The returned module is a function of the source alone: emission is a
            // side effect, never a change to what consumers import.
            assert.equal(glueOn, glueOff);
        } finally {
            removeCrate(dir);
        }
    },
);
