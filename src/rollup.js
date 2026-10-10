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
        target: {
            type: "string",
            enum: ["web", "node"],
            description:
                "Build strategy for the inlined wasm (`web` or `node`). Rollup has no platform of its own, so pick the one that matches your output.",
        },
        ...sharedOptionProperties,
    },
    additionalProperties: false,
};

// Makes a Rollup plugin that compiles `.rs` modules to JavaScript with inline wasm.
// `overrides` adds plugin fields, so that another integration can add its own hooks.
function createRustWasmRollupPlugin(config, overrides) {
    const options = merge({ target: "web", logLevel: "info" }, config);

    schemaUtils.validate(optionsSchema, options, {
        name: "rust-wasmpack-loader",
    });

    return {
        name: "rust-wasmpack-loader",
        async load(id) {
            if (!isRustModule(id)) {
                return null;
            }
            const resourcePath = cleanId(id);
            const code = await buildRsModule({
                resourcePath,
                baseFolder: process.cwd(),
                target: options.target,
                logLevel: options.logLevel,
                emitTypes: options.types === true,
            });
            // Rollup watches only the files it reads itself, so declare every build input.
            rsWatchFiles(resourcePath, process.cwd()).forEach((file) =>
                this.addWatchFile(file),
            );
            return code;
        },
        ...overrides,
    };
}

module.exports = function rollup(config) {
    return createRustWasmRollupPlugin(config);
};
module.exports.createRustWasmRollupPlugin = createRustWasmRollupPlugin;
