const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const pack = require("./pack");
const {
    isolatedCrate,
    packParams,
    removeCrate,
    skip,
} = require("../test/helpers");

// The seven deliveries `selectDelivery` can pick, named as the loader reports
// them: the four target/option combinations plus the three import strategies.
const DELIVERIES = [
    ["node inline", { target: "node", node: { bundle: true } }],
    ["node fsread", { target: "node", node: { bundle: false } }],
    [
        "web inline",
        {
            target: "web",
            web: {
                asyncLoading: false,
                publicPath: "",
                wasmPathModifier: ["/"],
            },
        },
    ],
    [
        "web async",
        {
            target: "web",
            web: {
                asyncLoading: true,
                publicPath: "/",
                wasmPathModifier: ["/"],
            },
        },
    ],
    [
        "import fetch",
        { import: { urlExpression: "__WASM_URL__", strategy: "fetch" } },
    ],
    [
        "import fs",
        { import: { urlExpression: "__WASM_PATH__", strategy: "fs" } },
    ],
    [
        "import module",
        { import: { urlExpression: "__WASM_MODULE__", strategy: "module" } },
    ],
];

// Every delivery shares one build folder, so only the first call pays for a
// wasm-pack build and the rest are cache hits on the same binary.
test(
    "every delivery exposes the class on the default export",
    { skip },
    async (t) => {
        const dir = isolatedCrate("rs-pack-class-", {
            marker: false,
            buildFolder: true,
        });
        try {
            await DELIVERIES.reduce(
                (chain, [name, overrides]) =>
                    chain.then(async () => {
                        const glue = await pack(
                            packParams(dir, overrides),
                            () => undefined,
                        );
                        await t.test(name, () => {
                            assert.match(
                                glue,
                                /export class Point \{/,
                                "the class declaration must survive the patch",
                            );
                            assert.match(
                                glue,
                                /exportedFunctions = \{[^}]*Point:Point/,
                                "the class must be named on the default export",
                            );
                            assert.match(glue, /fibonacci: fibonacci/);
                            assert.match(glue, /cap: cap/);
                        });
                    }),
                Promise.resolve(),
            );
        } finally {
            removeCrate(dir);
        }
    },
);

// Import both self-contained deliveries as real modules, so the class runs on
// a live wasm instance. The emitted text alone does not test the wasm boundary.
const SELF_CONTAINED = DELIVERIES.filter(([name]) => name.endsWith(" inline"));

test(
    "the class is constructible and live in the inline deliveries",
    { skip },
    async (t) => {
        const dir = isolatedCrate("rs-pack-class-", {
            marker: false,
            buildFolder: true,
        });
        try {
            await SELF_CONTAINED.reduce(
                (chain, [name, overrides], index) =>
                    chain.then(async () => {
                        const modulePath = path.join(dir, `mod${index}.mjs`);
                        fs.writeFileSync(
                            modulePath,
                            await pack(
                                packParams(dir, overrides),
                                () => undefined,
                            ),
                            "utf8",
                        );
                        const lib = (
                            await import(pathToFileURL(modulePath).href)
                        ).default;
                        await t.test(name, () => {
                            const point = new lib.Point(3, 4);
                            assert.equal(point.x, 3);
                            assert.equal(point.y, 4);
                            assert.equal(point.norm(), 5);
                            point.x = 6;
                            assert.equal(point.x, 6);
                            assert.equal(lib.fibonacci(10), 55);
                            point.free();
                        });
                    }),
                Promise.resolve(),
            );
        } finally {
            removeCrate(dir);
        }
    },
);
