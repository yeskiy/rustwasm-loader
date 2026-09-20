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

// Next.js runs the webpack pass once per environment (browser client, Node
// server, Edge server). `isServer` is the backend/frontend signal and
// `nextRuntime` distinguishes the Node server pass from the Edge one. The Node
// and browser passes inline the wasm bytes; the Edge pass cannot instantiate wasm
// from bytes, so it takes the `module` delivery (target `web`, since Edge is a
// web-like runtime), shipping a pre-compiled WebAssembly.Module via a `?module`
// import that Next's internal Edge wasm loader injects.
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

// Next sets `webassemblyModuleFilename` to a nested, token-laden path
// (`static/wasm/[modulehash].wasm`). The loader feeds that value to wasm-pack as
// the scratch output name, where the nested dir does not exist and `[modulehash]`
// is not a known token, so the build fails. The name never surfaces (the bytes are
// inlined, and the Edge `module` delivery imports from its own cache path), so a
// flat name is safe on every pass, Edge included.
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

/**
 * Wraps a Next.js config so `.rs` imports compile to inline-wasm JavaScript: the
 * `node` strategy for the server (SSR/prerender) and the `web` strategy for the
 * client, both with the bytes inlined. The same `.rs` works from a Server
 * Component and a Client Component.
 *
 * The returned config carries both a `webpack` function and a Turbopack rule
 * block, so it builds the same way under either bundler. Next 16 builds with
 * Turbopack by default and `next build --webpack` opts back to webpack. Next 15
 * builds with webpack by default and `next build --turbopack` opts in, from 15.3
 * on. Setting both keys is supported: Next only rejects a `webpack` config under
 * Turbopack when no Turbopack config is present.
 *
 * The Turbopack block goes under whichever key the running Next.js reads, in the
 * rule shape that release accepts. See `utils/nextTurbopack.util.js`.
 *
 * Edge routes work too: the Edge pass takes the `module` delivery, shipping a
 * pre-compiled WebAssembly.Module via a `?module` import (the only form the Edge
 * runtime can instantiate). The Node and browser passes still inline the bytes,
 * so the asset-emitting modes (`web.asyncLoading`, `node.bundle: false`) stay out
 * of the Next path and the helper never needs `emitFile`/`_compilation`, which
 * Turbopack's loader API omits.
 *
 * Loaders resolve through `require.resolve` against this package, so the helper
 * wires up the right files regardless of the consumer's module resolution.
 *
 * The return value is a config Next.js calls, and the call builds the Edge wasm
 * of every `.rs` file before the bundler starts. Turbopack cannot resolve a wasm
 * that first appears while the build runs, and a dependency change gives the
 * file a new name. The same value carries the config keys as properties, so a
 * caller that reads `turbopack` or `webpack` instead of calling still works.
 * @param {import("next").NextConfig} [nextConfig] - the Next.js config to extend
 * @param {{ logLevel?: string, types?: boolean, prebuild?: boolean | string[] }} [pluginOptions]
 * @returns {import("next").NextConfig & (() => Promise<import("next").NextConfig>)}
 */
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

    // Next.js calls a config that is a function, which is what gives the
    // pre-build somewhere asynchronous to run. The same value also carries the
    // config keys, so anything that reads `config.turbopack` or `config.webpack`
    // keeps working. Each key reads the one config object, so the call result
    // and the properties cannot describe different configurations.
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
