const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const generateTypes = require("./generateTypes.util");
const { buildTypedDts } = require("./generateTypes.util");
const { assertSidecar, isolatedCrate, skip } = require("../../test/helpers");

test(
    "buildTypedDts returns the raw wasm-bindgen .d.ts and writes nothing",
    { skip },
    async () => {
        const dir = isolatedCrate("rs-gen-");
        try {
            const dts = await buildTypedDts(path.join(dir, "math.rs"));
            assert.match(dts, /export function fibonacci/);
            assert.match(dts, /export function cap/);
            assert.equal(
                fs.existsSync(path.join(dir, "math.d.rs.ts")),
                false,
                "buildTypedDts must not write a sidecar",
            );
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    },
);

test(
    "writes a sidecar with the precise function and class signatures",
    { skip },
    async () => {
        const dir = isolatedCrate("rs-gen-");
        try {
            const out = await generateTypes(path.join(dir, "math.rs"));
            assert.equal(out, path.join(dir, "math.d.rs.ts"));
            assertSidecar(fs.readFileSync(out, "utf8"));
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    },
);
