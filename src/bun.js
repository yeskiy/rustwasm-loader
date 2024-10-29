const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { merge } = require("lodash");
const schemaUtils = require("schema-utils");
const pack = require("./pack");

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
            build.onLoad({ filter: /\.rs$/ }, async (args) => {
                const params = {
                    baseFolder: process.cwd(),
                    resourcePath: args.path,
                    target: "node",
                };

                const source = fs.readFileSync(params.resourcePath, "utf8");
                const { base } = path.parse(
                    path.normalize(params.resourcePath),
                );

                // Create a build folder and name with md5 of a source
                const tmp = os.tmpdir();
                const hash = crypto
                    .createHash("md5")
                    .update(source)
                    .digest("hex");
                const buildFolder = path.join(tmp, `${base}.${hash}`);

                // create required folders for build
                if (!fs.existsSync(buildFolder)) {
                    fs.mkdirSync(buildFolder, { recursive: true });
                }

                const content = await pack(
                    {
                        resourcePath: params.resourcePath,
                        baseFolder: params.baseFolder,
                        target: params.target,
                        buildFolder,
                        wasmName: `${hash}.wasm`,
                        logLevel: options.logLevel,
                        web: {},
                        node: {
                            bundle: true,
                        },
                    },
                    async () => {
                        //  ignore
                    },
                );

                return {
                    contents: content,
                    loader: "js",
                };
            });
        },
    };
};
