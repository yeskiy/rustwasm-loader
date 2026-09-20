const fs = require("node:fs");

// Next.js moved the Turbopack block twice, so one config shape cannot serve
// every release the package supports.
//
// Up to 15.2 the block is `experimental.turbo`. Next 15.3 promoted it to a
// top-level `turbopack` key and kept `experimental.turbo` as a deprecated alias.
// Next 16 dropped the alias, so a config written under it is ignored.
//
// The rule value changed too. Up to 15.5 a per-environment rule is a map keyed
// by a builtin condition (`edge-light`, `browser`, `default`). Next 16 replaced
// that map with a list of `{ condition, loaders, as }` entries and dropped the
// `default` key. The two shapes are exclusive: each major warns about the other
// and then drops the rule, which leaves `.rs` files unhandled.
const TOP_LEVEL_KEY_SINCE = [15, 3];
const RULE_LIST_SINCE = [16, 0];

// The three passes Next.js runs, in the order a rule list must declare them.
// `edge-light` comes first so it wins over the broader `{ not: "browser" }`
// condition that also matches the Edge bundle. The Edge pass takes the `module`
// delivery because the Edge runtime cannot instantiate wasm from bytes. The
// other two passes inline the bytes.
const PASSES = [
    {
        mapKey: "edge-light",
        condition: "edge-light",
        target: "web",
        options: { import: { strategy: "module" } },
    },
    {
        mapKey: "browser",
        condition: "browser",
        target: "web",
        options: { web: { asyncLoading: false } },
    },
    {
        mapKey: "default",
        condition: { not: "browser" },
        target: "node",
        options: { node: { bundle: true } },
    },
];

const isAtLeast = (version, [major, minor]) => {
    const [ownMajor, ownMinor] = version.split(".").map(Number);
    return ownMajor > major || (ownMajor === major && ownMinor >= minor);
};

const ruleBody = (pass, loader, shared) => ({
    loaders: [
        {
            loader,
            options: { target: pass.target, ...pass.options, ...shared },
        },
    ],
    as: "*.js",
});

const ruleList = (loader, shared) =>
    PASSES.map((pass) => ({
        condition: pass.condition,
        ...ruleBody(pass, loader, shared),
    }));

const ruleMap = (loader, shared) =>
    Object.fromEntries(
        PASSES.map((pass) => [pass.mapKey, ruleBody(pass, loader, shared)]),
    );

/**
 * Reads the version of the Next.js the consumer runs. Resolution starts at the
 * project directory so a linked copy of this package still sees the app's own
 * Next.js, and falls back to this package's own resolution path.
 * @returns {string|null} the version, or null when Next.js is not resolvable
 */
function detectNextVersion() {
    try {
        return JSON.parse(
            fs.readFileSync(
                require.resolve("next/package.json", {
                    paths: [process.cwd(), __dirname],
                }),
                "utf8",
            ),
        ).version;
    } catch {
        return null;
    }
}

/**
 * Builds the Turbopack part of the Next.js config in the shape the given
 * Next.js reads. An unknown version takes the newest shape.
 * @param {import("next").NextConfig} nextConfig - the config being extended
 * @param {string} loader - absolute path to the webpack loader
 * @param {object} shared - loader options every pass carries
 * @param {string|null} version - the running Next.js version
 * @returns {object} a partial config to spread over `nextConfig`
 */
function turbopackSection(nextConfig, loader, shared, version) {
    const rules = {
        "*.rs":
            version === null || isAtLeast(version, RULE_LIST_SINCE)
                ? ruleList(loader, shared)
                : ruleMap(loader, shared),
    };

    if (version === null || isAtLeast(version, TOP_LEVEL_KEY_SINCE)) {
        return {
            turbopack: {
                ...nextConfig.turbopack,
                rules: { ...nextConfig.turbopack?.rules, ...rules },
            },
        };
    }

    return {
        experimental: {
            ...nextConfig.experimental,
            turbo: {
                ...nextConfig.experimental?.turbo,
                rules: { ...nextConfig.experimental?.turbo?.rules, ...rules },
            },
        },
    };
}

module.exports = { detectNextVersion, turbopackSection };
