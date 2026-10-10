const { merge } = require("lodash");
const schemaUtils = require("schema-utils");
const sharedLoad = require("./shared-load.util");

const { sharedOptionProperties } = sharedLoad;

const optionsSchema = {
    type: "object",
    properties: sharedOptionProperties,
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
        setup(build) {
            build.onLoad({ filter: /\.rs$/ }, (args) =>
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
