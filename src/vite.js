const { merge } = require("lodash");
const schemaUtils = require("schema-utils");
const {
    buildRsModule,
    rsWatchFiles,
    sharedOptionProperties,
    cleanId,
    isRustModule,
} = require("./shared-load.util");

const optionsSchema = {
    type: "object",
    properties: {
        ssrNoExternal: {
            description:
                "Package name(s) shipping `.rs` files to keep bundled for SSR (merged into Vite's `ssr.noExternal`). Needed when a crate is consumed from `node_modules`.",
            type: "array",
            items: { type: "string" },
        },
        ...sharedOptionProperties,
    },
    additionalProperties: false,
};

// SSR consumers that bundle everything into one file (web workers, edge) cannot
// fetch a sibling asset, so they always take the inline path.
const bundledSsrTargets = new Set(["webworker"]);

// True for a server-side rendering (SSR) load. Vite 6 and later supply `environment`,
// and Vite 5 supplies the `options.ssr` flag.
const resolveIsSSR = (ctx, loadOptions) =>
    ctx.environment
        ? ctx.environment.config.consumer === "server"
        : Boolean(loadOptions?.ssr);

// SSR builds use the `node` target, and the client uses `web`. Only the client production
// build emits a separate `.wasm` asset. All other builds inline the wasm bytes.
function vite(config) {
    const options = merge({ ssrNoExternal: [], logLevel: "info" }, config);

    schemaUtils.validate(optionsSchema, options, {
        name: "rust-wasmpack-loader",
    });

    const resolved = { command: "serve", ssrTarget: undefined };

    return {
        name: "rust-wasmpack-loader",
        enforce: "pre",

        // Vite matches `ssr.noExternal` against package names, not file paths. For this reason,
        // the consumer names the packages that ship `.rs` files.
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

            const shouldEmit =
                !isSSR &&
                resolved.command === "build" &&
                !bundledSsrTargets.has(resolved.ssrTarget);

            const baseParams = {
                resourcePath: cleanId(id),
                baseFolder: process.cwd(),
                target: isSSR ? "node" : "web",
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

        // The dev server and the build watcher see only the files a plugin declares.
        // The dev server keeps them only after it made the module node, which is after load.
        transform(code, id) {
            if (isRustModule(id)) {
                rsWatchFiles(cleanId(id), process.cwd()).forEach((file) =>
                    this.addWatchFile(file),
                );
            }
            return null;
        },
    };
}

module.exports = vite;
