const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const pack = require("./pack");
const buildInputsHash = require("./utils/buildInputsHash.util");

const { watchFilesFor } = buildInputsHash;
const withBuildLock = require("./utils/buildLock.util");

const inlineWebOptions = {
    asyncLoading: false,
    publicPath: "",
    wasmPathModifier: ["/"],
};

const inlineNodeOptions = { bundle: true };

// The temp build dir name has a digest of the source and the cargo manifests,
// so that a dependency change never reuses the artifacts of an earlier build.
function resolveBuildContext(resourcePath, baseFolder) {
    const source = fs.readFileSync(resourcePath, "utf8");
    const { base } = path.parse(path.normalize(resourcePath));
    const hash = buildInputsHash(source, resourcePath, baseFolder);
    const buildFolder = path.join(os.tmpdir(), `${base}.${hash}`);
    if (!fs.existsSync(buildFolder)) {
        fs.mkdirSync(buildFolder, { recursive: true });
    }
    return { buildFolder, wasmName: `${hash}.wasm` };
}

const noopEmit = async () => {
    // The inline and import deliveries emit no asset through pack.
};

// Builds a `.rs` file for Bun, esbuild, Rollup, and Vite. The wasm bytes are inline, unless `delivery` is
// "import": then `emitWasm(bytes, name)` gives the wasm to the host and returns the JS expression for its URL.
async function buildRsModule(params) {
    const baseFolder = params.baseFolder || process.cwd();
    const { buildFolder, wasmName } = resolveBuildContext(
        params.resourcePath,
        baseFolder,
    );

    const basePackParams = {
        resourcePath: params.resourcePath,
        baseFolder,
        target: params.target,
        buildFolder,
        wasmName,
        logLevel: params.logLevel,
        emitTypes: params.emitTypes === true,
        web: inlineWebOptions,
        node: inlineNodeOptions,
    };

    if (params.delivery !== "import" || !params.emitWasm) {
        return pack(basePackParams, noopEmit);
    }

    // The asset URL exists only after the first build, so a second pass makes the glue around it.
    // The second pass does not compile Rust again. The lock covers both passes and the read.
    return withBuildLock(buildFolder, async () => {
        await pack(basePackParams, noopEmit);
        const wasmBytes = fs.readFileSync(
            path.join(buildFolder, "pkg", wasmName),
        );
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
    });
}

// The files to watch for one `.rs` entry: the entry, the module files of its last build, and the cargo manifests.
const rsWatchFiles = (resourcePath, baseFolder) => [
    path.resolve(resourcePath),
    ...watchFilesFor(resourcePath, baseFolder || process.cwd()),
];

// The onLoad result for Bun and esbuild. Bun ignores `watchFiles`.
async function sharedLoad(params) {
    return {
        contents: await buildRsModule(params),
        loader: "js",
        watchFiles: rsWatchFiles(params.resourcePath, params.baseFolder),
    };
}

module.exports = sharedLoad;
module.exports.buildRsModule = buildRsModule;
module.exports.rsWatchFiles = rsWatchFiles;
