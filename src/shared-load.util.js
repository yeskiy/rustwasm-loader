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
 * @property {"inline" | "import"} [delivery] - how the wasm reaches the consumer (defaults to "inline")
 * @property {"fetch" | "fs" | "module"} [strategy] - import-delivery consumption mode (required when delivery is "import")
 * @property {(bytes: Buffer, wasmName: string) => string} [emitWasm] - emits the wasm as a host asset and returns the JS expression that resolves to its URL (import delivery only)
 * @property {string} [preamble] - source prepended to the generated module (import delivery only)
 */

const inlineWebOptions = {
    asyncLoading: false,
    usePublicPath: false,
    publicPath: [],
    wasmPathModifier: ["/"],
};

const inlineNodeOptions = { bundle: true };

// Per-source temp build dir, content-addressed by the source hash so rebuilds
// are cache-friendly. Mirrors the scheme the Webpack loader computes inline.
function resolveBuildContext(resourcePath) {
    const source = fs.readFileSync(resourcePath, "utf8");
    const { base } = path.parse(path.normalize(resourcePath));
    const hash = crypto.createHash("sha256").update(source).digest("hex");
    const buildFolder = path.join(os.tmpdir(), `${base}.${hash}`);
    if (!fs.existsSync(buildFolder)) {
        fs.mkdirSync(buildFolder, { recursive: true });
    }
    return { buildFolder, wasmName: `${hash}.wasm` };
}

const noopEmit = async () => {
    // ignore: inline and import deliveries never emit through pack
};

/**
 * Shared build core for non-Webpack integrations (Bun, esbuild, Rollup, Vite).
 * Reads the .rs source, builds it through wasm-pack into a per-source temp dir,
 * and returns the generated JS module.
 *
 * Default (no `emitWasm`): the wasm is inlined as bytes, byte-for-byte identical
 * to the original behavior every esbuild-style integration relies on.
 *
 * Opt-in import delivery (`delivery: "import"` + `emitWasm`): the wasm is built to
 * disk, handed to the host bundler via `emitWasm` (which returns the runtime URL
 * expression), and the module inits from that URL instead of carrying the bytes.
 * @param {SharedLoadParams} params
 * @returns {Promise<string>} the generated JavaScript module source
 */
async function buildRsModule(params) {
    const baseFolder = params.baseFolder || process.cwd();
    const { buildFolder, wasmName } = resolveBuildContext(params.resourcePath);

    const basePackParams = {
        resourcePath: params.resourcePath,
        baseFolder,
        target: params.target,
        buildFolder,
        wasmName,
        logLevel: params.logLevel,
        web: inlineWebOptions,
        node: inlineNodeOptions,
    };

    if (params.delivery !== "import" || !params.emitWasm) {
        return pack(basePackParams, noopEmit);
    }

    // Import delivery needs the host to own the asset, but its URL only exists
    // after the bytes do. Build once so the wasm lands in the pkg dir, emit those
    // bytes to get the URL expression, then let pack regenerate the glue around
    // `params.import`. The second pass is a wasm-pack cache hit on the same
    // content-addressed dir, so no Rust recompilation happens.
    await pack(basePackParams, noopEmit);
    const wasmBytes = fs.readFileSync(path.join(buildFolder, "pkg", wasmName));
    return pack(
        {
            ...basePackParams,
            import: {
                urlExpression: params.emitWasm(wasmBytes, wasmName),
                strategy: params.strategy,
                preamble: params.preamble,
            },
        },
        noopEmit,
    );
}

/**
 * Shared onLoad routine for esbuild-compatible plugins (Bun and esbuild).
 * Wraps {@link buildRsModule} in the `{ contents, loader }` shape esbuild expects.
 * @param {SharedLoadParams} params
 * @returns {Promise<{ contents: string, loader: "js" }>}
 */
async function sharedLoad(params) {
    return {
        contents: await buildRsModule(params),
        loader: "js",
    };
}

module.exports = sharedLoad;
module.exports.buildRsModule = buildRsModule;
