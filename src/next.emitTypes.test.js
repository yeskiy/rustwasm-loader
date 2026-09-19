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

// The loader options for each of the three turbopack `*.rs` rules. Next 16 holds
// them in a list, Next 14 and 15 in a map keyed by condition, so read both.
function turbopackRuleOptions(pluginOptions) {
    const config = withRustWasm({}, pluginOptions);
    const rules = (config.turbopack ?? config.experimental.turbo).rules["*.rs"];
    return Object.values(rules).map((rule) => rule.loaders[0].options);
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
