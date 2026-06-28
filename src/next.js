const { merge } = require("lodash");
const schemaUtils = require("schema-utils");

const optionsSchema = {
    type: "object",
    properties: {
        logLevel: {
            type: "string",
            description:
                "Log Level (`verbose`, `info`, `warn`, `error`, `quiet`)",
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
const rsRule = (isServer, nextRuntime, logLevel) =>
    rsLoaderRule(
        nextRuntime === "edge"
            ? { target: "web", import: { strategy: "module" }, logLevel }
            : {
                  target: isServer ? "node" : "web",
                  node: { bundle: true },
                  web: { asyncLoading: false },
                  logLevel,
              },
    );

// Turbopack runs webpack loaders through `turbopack.rules`, mapping an extension
// to loaders plus `as: "*.js"`. Its `condition` picks the loader per environment:
// `edge-light` is the Edge bundle, `browser` is the client, `{ not: "browser" }`
// is the Node server. Turbopack's loader API omits emitFile/_compilation/
// this.target, so the loader reads `target` from these options; the inlined-bytes
// and `module` deliveries both fit that thinner context. Edge needs the `module`
// delivery (it cannot instantiate wasm from bytes), and its rule is listed first
// so it wins over the broader `{ not: "browser" }` condition that also matches Edge.
const turbopackLoader = (target, extraOptions, logLevel) => ({
    loader: require.resolve("./index"),
    options: {
        target,
        ...extraOptions,
        logLevel,
    },
});

const turbopackRule = (condition, target, extraOptions, logLevel) => ({
    condition,
    loaders: [turbopackLoader(target, extraOptions, logLevel)],
    as: "*.js",
});

const turbopackRsRules = (logLevel) => [
    turbopackRule(
        "edge-light",
        "web",
        { import: { strategy: "module" } },
        logLevel,
    ),
    turbopackRule("browser", "web", { web: { asyncLoading: false } }, logLevel),
    turbopackRule(
        { not: "browser" },
        "node",
        { node: { bundle: true } },
        logLevel,
    ),
];

// Next sets `webassemblyModuleFilename` to a nested, token-laden path
// (`static/wasm/[modulehash].wasm`). The loader feeds that value to wasm-pack as
// the scratch output name, where the nested dir does not exist and `[modulehash]`
// is not a known token, so the build fails. The name never surfaces (the bytes are
// inlined, and the Edge `module` delivery imports from its own cache path), so a
// flat name is safe on every pass, Edge included.
const withRsRule = (config, isServer, nextRuntime, logLevel) => ({
    ...config,
    output: {
        ...config.output,
        webassemblyModuleFilename: "[hash].module.wasm",
    },
    module: {
        ...config.module,
        rules: [
            ...(config.module?.rules ?? []),
            rsRule(isServer, nextRuntime, logLevel),
        ],
    },
});

/**
 * Wraps a Next.js config so `.rs` imports compile to inline-wasm JavaScript: the
 * `node` strategy for the server (SSR/prerender) and the `web` strategy for the
 * client, both with the bytes inlined. The same `.rs` works from a Server
 * Component and a Client Component.
 *
 * The returned config carries both a `webpack` function and a `turbopack.rules`
 * block, so it builds the same way under either bundler (`next build` defaults to
 * Turbopack in Next 16; `next build --webpack` opts back to webpack). Setting both
 * keys is supported: Next only rejects a `webpack` config under Turbopack when no
 * `turbopack` config is present.
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
 * @param {import("next").NextConfig} [nextConfig] - the Next.js config to extend
 * @param {{ logLevel?: string }} [pluginOptions]
 * @returns {import("next").NextConfig}
 */
function withRustWasm(nextConfig = {}, pluginOptions = {}) {
    const options = merge({ logLevel: "info" }, pluginOptions);

    schemaUtils.validate(optionsSchema, options, {
        name: "rust-wasmpack-loader",
    });

    return {
        ...nextConfig,
        turbopack: {
            ...nextConfig.turbopack,
            rules: {
                ...nextConfig.turbopack?.rules,
                "*.rs": turbopackRsRules(options.logLevel),
            },
        },
        webpack(config, webpackOptions) {
            const patched = withRsRule(
                config,
                webpackOptions.isServer,
                webpackOptions.nextRuntime,
                options.logLevel,
            );

            return typeof nextConfig.webpack === "function"
                ? nextConfig.webpack(patched, webpackOptions)
                : patched;
        },
    };
}

module.exports = withRustWasm;
