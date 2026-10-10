const { merge } = require("lodash");
const schemaUtils = require("schema-utils");
const {
    detectNextVersion,
    turbopackSection,
} = require("./utils/nextTurbopack.util");
const prebuildEdgeWasm = require("./utils/nextPrebuild.util");

const optionsSchema = {
    type: "object",
    properties: {
        logLevel: {
            type: "string",
            description:
                "Log Level (`verbose`, `info`, `warn`, `error`, `quiet`)",
        },
        types: {
            type: "boolean",
            description:
                "Also write the `<name>.d.rs.ts` sidecar next to each `.rs` source during the build (off by default)",
        },
        prebuild: {
            description:
                "Edge wasm pre-build that runs when the config loads. Omit it to scan the project for `.rs` files, pass a list to name them instead of scanning, or pass `false` to switch it off.",
            anyOf: [
                { type: "boolean" },
                { type: "array", items: { type: "string" } },
            ],
        },
    },
    additionalProperties: false,
};

const rsLoaderRule = (options) => ({
    test: /\.rs$/,
    exclude: /node_modules/,
    use: [{ loader: require.resolve("./index"), options }],
});

// The browser and Node server passes inline the wasm bytes. The Edge runtime cannot compile bytes,
// so the Edge pass imports a compiled WebAssembly.Module with `?module`.
const rsRule = (isServer, nextRuntime, shared) =>
    rsLoaderRule(
        nextRuntime === "edge"
            ? { target: "web", import: { strategy: "module" }, ...shared }
            : {
                  target: isServer ? "node" : "web",
                  node: { bundle: true },
                  web: { asyncLoading: false },
                  ...shared,
              },
    );

// The Next value `static/wasm/[modulehash].wasm` breaks the wasm-pack output name.
// No pass emits the wasm under this name, so a flat name is safe.
const withRsRule = (config, isServer, nextRuntime, shared) => ({
    ...config,
    output: {
        ...config.output,
        webassemblyModuleFilename: "[hash].module.wasm",
    },
    module: {
        ...config.module,
        rules: [
            ...(config.module?.rules ?? []),
            rsRule(isServer, nextRuntime, shared),
        ],
    },
});

// Adds a webpack rule and a Turbopack rule for `.rs` files, so that both bundlers build them.
// Next rejects a `webpack` key under Turbopack only when the config has no Turbopack key.
function withRustWasm(nextConfig = {}, pluginOptions = {}) {
    const options = merge({ logLevel: "info" }, pluginOptions);

    schemaUtils.validate(optionsSchema, options, {
        name: "rust-wasmpack-loader",
    });

    // Cross-cutting loader options every pass shares. Each rule spreads them.
    const shared = {
        logLevel: options.logLevel,
        types: options.types === true,
    };

    const config = {
        ...nextConfig,
        ...turbopackSection(
            nextConfig,
            require.resolve("./index"),
            shared,
            detectNextVersion(),
        ),
        webpack(webpackConfig, webpackOptions) {
            const patched = withRsRule(
                webpackConfig,
                webpackOptions.isServer,
                webpackOptions.nextRuntime,
                shared,
            );

            return typeof nextConfig.webpack === "function"
                ? nextConfig.webpack(patched, webpackOptions)
                : patched;
        },
    };

    // Next calls a function config, so the Edge wasm pre-build runs before the bundler starts,
    // as Turbopack requires. The function also has the config keys as properties.
    const callable = async () => {
        await prebuildEdgeWasm(
            process.cwd(),
            { target: "web", import: { strategy: "module" }, ...shared },
            Array.isArray(options.prebuild) ? options.prebuild : undefined,
        );
        return config;
    };

    Object.defineProperties(
        callable,
        Object.fromEntries(
            Object.keys(config).map((key) => [
                key,
                {
                    get: () => config[key],
                    enumerable: true,
                    configurable: true,
                },
            ]),
        ),
    );

    return options.prebuild === false ? config : callable;
}

module.exports = withRustWasm;
