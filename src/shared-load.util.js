const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const pack = require("./pack");

/** @typedef {Object} SharedLoadParams
 * @property {string} resourcePath - absolute path to the .rs file being loaded
 * @property {string} target - pack target ("node" or "web")
 * @property {string} logLevel - log level passed to wasm-pack
 * @property {string} [baseFolder] - project root used to resolve Cargo.toml (defaults to cwd)
 */

/**
 * Shared onLoad routine for esbuild-compatible plugins (Bun and esbuild).
 * Reads the .rs source, builds it through wasm-pack into a per-source temp dir,
 * and returns the generated JS with the wasm inlined as bytes.
 * @param {SharedLoadParams} params
 * @returns {Promise<{ contents: string, loader: "js" }>}
 */
module.exports = async function sharedLoad(params) {
    const baseFolder = params.baseFolder || process.cwd();
    const source = fs.readFileSync(params.resourcePath, "utf8");
    const { base } = path.parse(path.normalize(params.resourcePath));

    // Create a build folder and name with md5 of a source
    const hash = crypto.createHash("md5").update(source).digest("hex");
    const buildFolder = path.join(os.tmpdir(), `${base}.${hash}`);

    // create required folders for build
    if (!fs.existsSync(buildFolder)) {
        fs.mkdirSync(buildFolder, { recursive: true });
    }

    const contents = await pack(
        {
            resourcePath: params.resourcePath,
            baseFolder,
            target: params.target,
            buildFolder,
            wasmName: `${hash}.wasm`,
            logLevel: params.logLevel,
            web: {
                asyncLoading: false,
                usePublicPath: false,
                publicPath: [],
                wasmPathModifier: ["/"],
            },
            node: {
                bundle: true,
            },
        },
        async () => {
            //  ignore
        },
    );

    return {
        contents,
        loader: "js",
    };
};
