const test = require("node:test");
const assert = require("node:assert/strict");
const { detectNextVersion, turbopackSection } = require("./nextTurbopack.util");
const withRustWasm = require("../next");

const LOADER = "/pkg/src/index.js";
const SHARED = { logLevel: "info", types: false };

const sectionFor = (version, nextConfig = {}) =>
    turbopackSection(nextConfig, LOADER, SHARED, version);

const rulesOf = (section) =>
    (section.turbopack ?? section.experimental.turbo).rules["*.rs"];

const optionsOf = (rule) => rule.loaders[0].options;

// Next 16 reads a top-level `turbopack` key and takes a list of rules, each
// carrying its own `condition`.
test("Next 16 gets a rule list under the top-level turbopack key", () => {
    const section = sectionFor("16.3.5");
    assert.equal(section.experimental, undefined);
    const rules = rulesOf(section);
    assert.ok(Array.isArray(rules));
    assert.deepEqual(
        rules.map((rule) => rule.condition),
        ["edge-light", "browser", { not: "browser" }],
    );
    rules.forEach((rule) => {
        assert.equal(rule.as, "*.js");
        assert.equal(rule.loaders[0].loader, LOADER);
    });
});

// Next 15.3 through 15.5 read the same top-level key, but a per-environment rule
// is a map keyed by a builtin condition. The list shape crashes the build there.
test("Next 15.3 and later 15.x get a condition map under the top-level turbopack key", () => {
    ["15.3.9", "15.4.11", "15.5.25"].forEach((version) => {
        const section = sectionFor(version);
        assert.equal(section.experimental, undefined);
        const rules = rulesOf(section);
        assert.equal(Array.isArray(rules), false);
        assert.deepEqual(Object.keys(rules), [
            "edge-light",
            "browser",
            "default",
        ]);
        Object.values(rules).forEach((rule) => {
            assert.equal(rule.as, "*.js");
            assert.equal(rule.condition, undefined);
        });
    });
});

// Up to 15.2 the block lives under `experimental.turbo`. A top-level `turbopack`
// key is unknown there and Next reports it as an invalid option.
test("Next 14 and Next 15.0 through 15.2 get the block under experimental.turbo", () => {
    ["14.2.35", "15.0.8", "15.1.12", "15.2.9"].forEach((version) => {
        const section = sectionFor(version);
        assert.equal(section.turbopack, undefined);
        assert.deepEqual(Object.keys(rulesOf(section)), [
            "edge-light",
            "browser",
            "default",
        ]);
    });
});

test("an unresolvable Next.js falls back to the newest shape", () => {
    const section = sectionFor(null);
    assert.equal(section.experimental, undefined);
    assert.ok(Array.isArray(rulesOf(section)));
});

// Every shape must carry the same three deliveries: the `module` import on Edge,
// inlined bytes on the browser and the Node server.
test("each pass keeps its target and delivery in both shapes", () => {
    const list = rulesOf(sectionFor("16.3.5"));
    assert.deepEqual(optionsOf(list[0]), {
        target: "web",
        import: { strategy: "module" },
        ...SHARED,
    });
    assert.deepEqual(optionsOf(list[1]), {
        target: "web",
        web: { asyncLoading: false },
        ...SHARED,
    });
    assert.deepEqual(optionsOf(list[2]), {
        target: "node",
        node: { bundle: true },
        ...SHARED,
    });

    const map = rulesOf(sectionFor("15.5.25"));
    assert.deepEqual(optionsOf(map["edge-light"]), optionsOf(list[0]));
    assert.deepEqual(optionsOf(map.browser), optionsOf(list[1]));
    assert.deepEqual(optionsOf(map.default), optionsOf(list[2]));
});

test("keeps the Turbopack settings the wrapped config already holds", () => {
    const section = sectionFor("16.3.5", {
        turbopack: { root: "/app", rules: { "*.glsl": ["raw-loader"] } },
    });
    assert.equal(section.turbopack.root, "/app");
    assert.deepEqual(section.turbopack.rules["*.glsl"], ["raw-loader"]);

    const legacy = sectionFor("15.2.9", {
        experimental: {
            optimizeCss: true,
            turbo: { rules: { "*.glsl": ["raw-loader"] } },
        },
    });
    assert.equal(legacy.experimental.optimizeCss, true);
    assert.deepEqual(legacy.experimental.turbo.rules["*.glsl"], ["raw-loader"]);
});

test("withRustWasm returns the section built for the detected Next.js", () => {
    const config = withRustWasm({ output: "standalone" });
    assert.equal(config.output, "standalone");
    const expected = turbopackSection(
        {},
        require.resolve("../index"),
        SHARED,
        detectNextVersion(),
    );
    assert.deepEqual(
        config.turbopack ?? config.experimental?.turbo,
        expected.turbopack ?? expected.experimental?.turbo,
    );
});
