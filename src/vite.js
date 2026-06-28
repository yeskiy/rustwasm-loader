const { merge } = require("lodash");
const schemaUtils = require("schema-utils");
const { buildRsModule } = require("./shared-load.util");

const optionsSchema = {
    type: "object",
    properties: {
        ssrNoExternal: {
            description:
                "Package name(s) shipping `.rs` files to keep bundled for SSR (merged into Vite's `ssr.noExternal`). Needed when a crate is consumed from `node_modules`.",
            type: "array",
            items: { type: "string" },
        },
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
    },
    additionalProperties: false,
};

// Vite/Rollup may append a `?query` or `#hash` to the resolved id; strip both
// before checking the extension so query-suffixed `.rs` ids still match.
const isRustModule = (id) => id.split("?")[0].split("#")[0].endsWith(".rs");

const cleanId = (id) => id.split("?")[0].split("#")[0];

// SSR consumers that bundle everything into one file (web workers, edge) cannot
// fetch a sibling asset, so they always take the inline path.
const bundledSsrTargets = new Set(["webworker"]);

/**
 * Resolves whether a given load runs for the server (SSR) build. Prefers the
 * Vite 6+ Environment API and falls back to the Vite 5 `options.ssr` flag.
 * @param {{ environment?: { config?: { consumer?: string } } }} ctx - the plugin hook `this`
 * @param {{ ssr?: boolean }} [loadOptions] - the `load` hook's second argument
 * @returns {boolean}
 */
const resolveIsSSR = (ctx, loadOptions) =>
    ctx.environment
        ? ctx.environment.config.consumer === "server"
        : Boolean(loadOptions?.ssr);

/**
 * Builds a Vite plugin that compiles `.rs` modules to WebAssembly, picking the
 * `node` strategy for SSR and the `web` strategy for the client automatically.
 *
 * Only the client production build emits a separate `.wasm` asset (fetched at
 * runtime via Rollup's file-url reference). Dev, every SSR build, and bundled
 * SSR targets (`webworker`/edge) inline the wasm bytes, which is always correct
 * and sidesteps dev-server asset plumbing.
 * @param {{ ssrNoExternal?: string[], logLevel?: string, types?: boolean }} [config]
 * @returns {import("vite").Plugin}
 */
function vite(config) {
    const options = merge({ ssrNoExternal: [], logLevel: "info" }, config);

    schemaUtils.validate(optionsSchema, options, {
        name: "rust-wasmpack-loader",
    });

    const resolved = { command: "serve", ssrTarget: undefined };

    return {
        name: "rust-wasmpack-loader",
        enforce: "pre",

        // Keep `.rs`-bearing dependencies bundled for SSR. Vite matches
        // `ssr.noExternal` against the npm package name (not the file path), so a
        // `.rs` extension cannot be matched generically; the consumer names the
        // package(s) through `ssrNoExternal`.
        config() {
            return options.ssrNoExternal.length > 0
                ? { ssr: { noExternal: options.ssrNoExternal } }
                : null;
        },

        configResolved(resolvedConfig) {
            resolved.command = resolvedConfig.command;
            resolved.ssrTarget = resolvedConfig.ssr?.target;
        },

        async load(id, loadOptions) {
            if (!isRustModule(id)) {
                return null;
            }

            const isSSR = resolveIsSSR(this, loadOptions);
            const target = isSSR ? "node" : "web";

            const shouldEmit =
                !isSSR &&
                resolved.command === "build" &&
                !bundledSsrTargets.has(resolved.ssrTarget);

            const baseParams = {
                resourcePath: cleanId(id),
                baseFolder: process.cwd(),
                target,
                logLevel: options.logLevel,
                emitTypes: options.types === true,
            };

            return shouldEmit
                ? buildRsModule({
                      ...baseParams,
                      delivery: "import",
                      strategy: "fetch",
                      emitWasm: (source, name) =>
                          `import.meta.ROLLUP_FILE_URL_${this.emitFile({
                              type: "asset",
                              name,
                              source,
                          })}`,
                  })
                : buildRsModule(baseParams);
        },
    };
}

module.exports = vite;
