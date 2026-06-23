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

// Next.js runs the webpack pass once per environment (browser client, Node
// server, Edge server). `isServer` is the backend/frontend signal and
// `nextRuntime` distinguishes the Node server pass from the Edge one. The Edge
// pass cannot run inlined-byte wasm, so its `.rs` files go through a guard loader
// that throws a clear error if (and only if) one is imported.
const rsRule = (isServer, nextRuntime, logLevel) =>
    nextRuntime === "edge"
        ? {
              test: /\.rs$/,
              exclude: /node_modules/,
              use: [{ loader: require.resolve("./next-edge-guard") }],
          }
        : {
              test: /\.rs$/,
              exclude: /node_modules/,
              use: [
                  {
                      loader: require.resolve("./index"),
                      options: {
                          target: isServer ? "node" : "web",
                          node: { bundle: true },
                          web: { asyncLoading: false },
                          logLevel,
                      },
                  },
              ],
          };

// Turbopack runs webpack loaders through `turbopack.rules`, mapping an extension
// to loaders plus `as: "*.js"`. Its `condition` picks the loader per environment:
// `browser` is the client bundle, `{ not: "browser" }` is the server. Turbopack's
// loader API omits emitFile/_compilation/this.target, so only the inlined-bytes
// delivery works; the loader reads `target` from these options instead. Edge is
// not modeled here: Turbopack has no `nextRuntime` signal in a rule condition, and
// the inlined-bytes delivery cannot instantiate wasm on Edge anyway.
const turbopackLoader = (target, webOrNode, logLevel) => ({
    loader: require.resolve("./index"),
    options: {
        target,
        ...webOrNode,
        logLevel,
    },
});

const turbopackRsRules = (logLevel) => [
    {
        condition: { not: "browser" },
        loaders: [
            turbopackLoader("node", { node: { bundle: true } }, logLevel),
        ],
        as: "*.js",
    },
    {
        condition: "browser",
        loaders: [
            turbopackLoader("web", { web: { asyncLoading: false } }, logLevel),
        ],
        as: "*.js",
    },
];

// Next sets `webassemblyModuleFilename` to a nested, token-laden path
// (`static/wasm/[modulehash].wasm`). The loader feeds that value to wasm-pack as
// the scratch output name, where the nested dir does not exist and `[modulehash]`
// is not a known token, so the build fails. The bytes are inlined and the name
// never surfaces, so a flat name is safe. The Edge pass never reaches the loader,
// so it is left untouched.
const withRsRule = (config, isServer, nextRuntime, logLevel) => ({
    ...config,
    ...(nextRuntime === "edge"
        ? {}
        : {
              output: {
                  ...config.output,
                  webassemblyModuleFilename: "[hash].module.wasm",
              },
          }),
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
 * Only the inlined-bytes delivery is wired. Turbopack's loader API omits
 * `emitFile`/`_compilation`, so the asset-emitting modes (`web.asyncLoading`,
 * `node.bundle: false`) cannot run under it. Edge routes are unsupported under
 * both bundlers because the Edge runtime cannot instantiate wasm from inlined
 * bytes; the webpack pass rejects an Edge `.rs` import with a clear error.
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
