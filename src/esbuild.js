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
    },
    additionalProperties: false,
};

// esbuild's `platform: "node"` builds for Node.js; "browser", "neutral", and
// the default (undefined) all target a browser-like environment.
const targetForPlatform = (platform) => (platform === "node" ? "node" : "web");

module.exports = function esbuild(config) {
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
        name: "rust-wasmpack-loader",
        setup(build) {
            build.onLoad({ filter: /\.rs$/ }, async (args) =>
                sharedLoad({
                    resourcePath: args.path,
                    baseFolder:
                        build.initialOptions.absWorkingDir || process.cwd(),
                    target: targetForPlatform(build.initialOptions.platform),
                    logLevel: options.logLevel,
                }),
            );
        },
    };
};
