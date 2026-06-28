const test = require("node:test");
const assert = require("node:assert/strict");
const withRustWasm = require("./next");

// The loader options the helper attaches to its webpack rule for a given pass.
function webpackRuleOptions(isServer, nextRuntime, pluginOptions) {
    const patched = withRustWasm({}, pluginOptions).webpack(
        {},
        { isServer, nextRuntime },
    );
    return patched.module.rules.at(-1).use[0].options;
}

// The loader options for each of the three turbopack `*.rs` rules.
function turbopackRuleOptions(pluginOptions) {
    return withRustWasm({}, pluginOptions).turbopack.rules["*.rs"].map(
        (rule) => rule.loaders[0].options,
    );
}

test("threads types:true into every webpack pass when set", () => {
    assert.equal(
        webpackRuleOptions(false, undefined, { types: true }).types,
        true,
    );
    assert.equal(
        webpackRuleOptions(true, undefined, { types: true }).types,
        true,
    );
    assert.equal(webpackRuleOptions(true, "edge", { types: true }).types, true);
});

test("threads types:true into every turbopack rule when set", () => {
    turbopackRuleOptions({ types: true }).forEach((options) =>
        assert.equal(options.types, true),
    );
});

test("defaults types to false on every rule", () => {
    assert.equal(webpackRuleOptions(false, undefined, {}).types, false);
    turbopackRuleOptions({}).forEach((options) =>
        assert.equal(options.types, false),
    );
});
