const fs = require("node:fs");

// The block is `experimental.turbo` up to Next 15.2 and `turbopack` from 15.3. A rule is a map
// keyed by condition up to 15.5 and a list from 16. Each major ignores the other rule shape.
const TOP_LEVEL_KEY_SINCE = [15, 3];
const RULE_LIST_SINCE = [16, 0];

// The Next.js passes in rule-list order. `edge-light` is first to win over `{ not: "browser" }`.
// It uses the `module` delivery, because the Edge runtime cannot instantiate wasm from bytes.
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

// Reads the Next.js version of the project, or null. Resolution starts at the project directory,
// so that a linked copy of this package finds the Next.js of the app.
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

// Builds the Turbopack part of the Next.js config in the shape that `version` reads.
// An unknown version gets the newest shape.
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
