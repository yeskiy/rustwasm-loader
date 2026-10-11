const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const rollup = require("./rollup");
const { isolatedCrate, removeCrate, skip } = require("../test/helpers");

const pluginContext = { addWatchFile: () => undefined };

test(
    "the rollup `types` option drives sidecar emission, off by default",
    { skip },
    async () => {
        const dir = isolatedCrate("rs-rollup-types-");
        const rs = path.join(dir, "math.rs");
        const sidecar = path.join(dir, "math.d.rs.ts");
        try {
            await rollup({
                target: "node",
                logLevel: "error",
                types: true,
            }).load.call(pluginContext, rs);
            assert.ok(
                fs.existsSync(sidecar),
                "types:true must write the sidecar",
            );
            assert.match(
                fs.readFileSync(sidecar, "utf8"),
                /fibonacci\(n: number\): number;/,
            );

            fs.rmSync(sidecar, { force: true });
            await rollup({ target: "node", logLevel: "error" }).load.call(
                pluginContext,
                rs,
            );
            assert.equal(
                fs.existsSync(sidecar),
                false,
                "the default (no `types`) must not write a sidecar",
            );
        } finally {
            removeCrate(dir);
        }
    },
);
