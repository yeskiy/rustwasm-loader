const { merge } = require("lodash");
const schemaUtils = require("schema-utils");
const sharedLoad = require("./shared-load.util");

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
    },
    additionalProperties: false,
};

module.exports = function bun(config) {
    const options = merge(
        {
            logLevel: "info",
        },
        config,
    );

    schemaUtils.validate(optionsSchema, options, {
        name: "rust-wasmpack-loader",
    });

    return {
        target: "node",
        name: "rust-wasmpack-loader",
        async setup(build) {
            build.onLoad({ filter: /\.rs$/ }, async (args) =>
                sharedLoad({
                    resourcePath: args.path,
                    baseFolder: process.cwd(),
                    target: "node",
                    logLevel: options.logLevel,
                    emitTypes: options.types === true,
                }),
            );
        },
    };
};
