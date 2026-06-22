const { merge } = require("lodash");
const schemaUtils = require("schema-utils");
const { buildRsModule } = require("./shared-load.util");

const optionsSchema = {
    type: "object",
    properties: {
        target: {
            type: "string",
            enum: ["web", "node"],
            description:
                "Build strategy for the inlined wasm (`web` or `node`). Rollup has no platform of its own, so pick the one that matches your output.",
        },
        logLevel: {
            type: "string",
            description:
                "Log Level (`verbose`, `info`, `warn`, `error`, `quiet`)",
        },
    },
    additionalProperties: false,
};

// Rollup passes the resolved module id, which may carry a `?query` or `#hash`
// suffix added by other plugins. Strip it before testing the extension.
const isRustModule = (id) => /\.rs$/.test(id.split("?")[0].split("#")[0]);

/**
 * Builds a Rollup plugin that compiles `.rs` modules to inline-wasm JavaScript.
 * Exposed as a factory so adjacent integrations (such as Vite, whose plugins are
 * a superset of Rollup's) can wrap the returned object and add their own hooks.
 * @param {{ target?: "web" | "node", logLevel?: string }} [config]
 * @param {Partial<import("rollup").Plugin>} [overrides] - extra plugin fields merged on top
 * @returns {import("rollup").Plugin}
 */
function createRustWasmRollupPlugin(config, overrides) {
    const options = merge({ target: "web", logLevel: "info" }, config);

    schemaUtils.validate(optionsSchema, options, {
        name: "rust-wasmpack-loader",
    });

    return {
        name: "rust-wasmpack-loader",
        async load(id) {
            return isRustModule(id)
                ? buildRsModule({
                      resourcePath: id.split("?")[0].split("#")[0],
                      baseFolder: process.cwd(),
                      target: options.target,
                      logLevel: options.logLevel,
                  })
                : null;
        },
        ...overrides,
    };
}

module.exports = function rollup(config) {
    return createRustWasmRollupPlugin(config);
};
module.exports.createRustWasmRollupPlugin = createRustWasmRollupPlugin;
