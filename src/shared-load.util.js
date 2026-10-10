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

// The option schema properties that every loader and plugin accepts.
const sharedOptionProperties = {
    logLevel: {
        type: "string",
        description: "Log Level (`verbose`, `info`, `warn`, `error`, `quiet`)",
    },
    types: {
        type: "boolean",
        description:
            "Also write the `<name>.d.rs.ts` sidecar next to each `.rs` source during the build (off by default)",
    },
};

// Other plugins can add a `?query` or `#hash` to the module id. Strip it before the extension test.
const cleanId = (id) => id.split("?")[0].split("#")[0];

const isRustModule = (id) => cleanId(id).endsWith(".rs");

// The inline and import deliveries emit no asset through pack.
const noopEmit = () => undefined;

// Makes the temp build dir `<source file name>.<name parts>`.
function tempBuildFolder(resourcePath, ...nameParts) {
    const buildFolder = path.join(
        os.tmpdir(),
        [path.parse(path.normalize(resourcePath)).base, ...nameParts].join("."),
    );
    fs.mkdirSync(buildFolder, { recursive: true });
    return buildFolder;
}

// The asset URL exists only after the first build, so a second pass makes the glue around it.
// The second pass does not compile Rust again. The lock covers both passes and `importFor`.
function packWithImport(basePackParams, importFor) {
    return withBuildLock(basePackParams.buildFolder, async () => {
        await pack(basePackParams, noopEmit);
        return pack(
            {
                ...basePackParams,
                import: importFor(
                    fs.readFileSync(
                        path.join(
                            basePackParams.buildFolder,
                            "pkg",
                            basePackParams.wasmName,
                        ),
                    ),
                ),
            },
            noopEmit,
        );
    });
}

// Builds a `.rs` file for Bun, esbuild, Rollup, and Vite. The wasm bytes are inline, unless `delivery` is
// "import": then `emitWasm(bytes, name)` gives the wasm to the host and returns the JS expression for its URL.
async function buildRsModule(params) {
    // The digest of the source and the cargo manifests names the build dir, so that
    // a dependency change never reuses the artifacts of an earlier build.
    const hash = buildInputsHash(
        fs.readFileSync(params.resourcePath, "utf8"),
        params.resourcePath,
        params.baseFolder,
    );
    const wasmName = `${hash}.wasm`;
    const basePackParams = {
        resourcePath: params.resourcePath,
        baseFolder: params.baseFolder,
        target: params.target,
        buildFolder: tempBuildFolder(params.resourcePath, hash),
        wasmName,
        logLevel: params.logLevel,
        emitTypes: params.emitTypes === true,
        web: inlineWebOptions,
        node: inlineNodeOptions,
    };

    return params.delivery === "import" && params.emitWasm
        ? packWithImport(basePackParams, (wasmBytes) => ({
              urlExpression: params.emitWasm(wasmBytes, wasmName),
              strategy: params.strategy,
              preamble: params.preamble,
          }))
        : pack(basePackParams, noopEmit);
}

// The files to watch for one `.rs` entry: the entry, the module files of its last build, and the cargo manifests.
const rsWatchFiles = (resourcePath, baseFolder) => [
    path.resolve(resourcePath),
    ...watchFilesFor(resourcePath, baseFolder),
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
module.exports.sharedOptionProperties = sharedOptionProperties;
module.exports.tempBuildFolder = tempBuildFolder;
module.exports.packWithImport = packWithImport;
module.exports.cleanId = cleanId;
module.exports.isRustModule = isRustModule;
