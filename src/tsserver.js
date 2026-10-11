// A tsserver plugin that serves the generated `.d.ts` of a `.rs` import as a TypeScript declaration.
// It never writes to disk. It reads the on-disk sidecar only to fill its cache.
const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");
const dtsToSidecar = require("./utils/dtsTransform.util");
const { sidecarPathOf } = require("./utils/writeSidecar.util");
const { buildTypedDts } = require("./utils/generateTypes.util");

// The loose types of a `.rs` module before its build completes, or after the build fails.
// Every export is callable, so the import never gives an error.
const FLOOR = [
    "declare const _default: Record<string, (...args: any[]) => any>;",
    "export default _default;",
    "",
].join("\n");

const isRs = (fileName) => fileName.endsWith(".rs");

const hashOf = (text) => crypto.createHash("sha256").update(text).digest("hex");

// Reads the `<stem>.d.rs.ts` sidecar of an earlier build, so that a cold editor
// shows the precise types before its own build completes.
function diskSidecarOf(resourcePath) {
    const sidecar = sidecarPathOf(resourcePath);
    return fs.existsSync(sidecar)
        ? fs.readFileSync(sidecar, "utf8")
        : undefined;
}

// `versionOf` and `snapshotOf` do not wait for a build. They serve the available types and start one
// background build for each content hash. A completed build changes the script version and calls `onGenerated`.
function createTypeCache({
    build,
    readFile,
    readDiskSidecar,
    onGenerated,
    onError,
}) {
    const cache = new Map(); // content hash -> generated sidecar `.d.ts`
    const counter = new Map(); // resourcePath -> completed-build count
    const inflight = new Map(); // content hash -> in-progress build promise

    const contentHash = (resourcePath) => hashOf(readFile(resourcePath) || "");

    const versionOf = (resourcePath) =>
        `${contentHash(resourcePath)}-${counter.get(resourcePath) || 0}`;

    const ensureFresh = (resourcePath) => {
        const hash = contentHash(resourcePath);
        if (cache.has(hash) || inflight.has(hash)) {
            return inflight.get(hash);
        }
        const job = Promise.resolve()
            .then(() => build(resourcePath))
            .then((dts) => {
                cache.set(hash, dtsToSidecar(dts));
                counter.set(resourcePath, (counter.get(resourcePath) || 0) + 1);
                onGenerated(resourcePath);
            })
            .catch((error) => onError(error, resourcePath))
            .finally(() => inflight.delete(hash));
        inflight.set(hash, job);
        return job;
    };

    const snapshotOf = (resourcePath) => {
        ensureFresh(resourcePath);
        return (
            cache.get(contentHash(resourcePath)) ||
            readDiskSidecar(resourcePath) ||
            FLOOR
        );
    };

    const pending = () => Promise.allSettled(inflight.values());

    return { versionOf, snapshotOf, ensureFresh, pending };
}

const rsResolution = (tsm, specifier, containingFile) => ({
    extension: tsm.Extension.Dts,
    isExternalLibraryImport: false,
    resolvedFileName: path.resolve(path.dirname(containingFile), specifier),
});

// Serves `.rs` files from the cache and passes other files to the host. It wraps only the
// resolution method that the host has, so that other imports keep the host resolution.
function buildHostOverrides({ tsm, host, cache }) {
    const wrapLiterals = (literals, containingFile, resolved) =>
        literals.map((literal, index) =>
            isRs(literal.text)
                ? {
                      resolvedModule: rsResolution(
                          tsm,
                          literal.text,
                          containingFile,
                      ),
                  }
                : resolved[index],
        );
    const wrapNames = (names, containingFile, resolved) =>
        names.map((name, index) =>
            isRs(name)
                ? rsResolution(tsm, name, containingFile)
                : resolved[index],
        );

    const overrides = {
        getScriptKind: (fileName) => {
            if (isRs(fileName)) return tsm.ScriptKind.TS;
            return host.getScriptKind
                ? host.getScriptKind(fileName)
                : tsm.ScriptKind.Unknown;
        },
        getScriptVersion: (fileName) =>
            isRs(fileName)
                ? cache.versionOf(fileName)
                : host.getScriptVersion(fileName),
        getScriptSnapshot: (fileName) =>
            isRs(fileName)
                ? tsm.ScriptSnapshot.fromString(cache.snapshotOf(fileName))
                : host.getScriptSnapshot(fileName),
    };

    if (host.resolveModuleNameLiterals) {
        const base = host.resolveModuleNameLiterals.bind(host);
        overrides.resolveModuleNameLiterals = (
            literals,
            containingFile,
            ...rest
        ) =>
            wrapLiterals(
                literals,
                containingFile,
                base(literals, containingFile, ...rest),
            );
    } else if (host.resolveModuleNames) {
        const base = host.resolveModuleNames.bind(host);
        overrides.resolveModuleNames = (names, containingFile, ...rest) =>
            wrapNames(
                names,
                containingFile,
                base(names, containingFile, ...rest),
            );
    }

    return overrides;
}

function create(info, { tsm, build }) {
    const host = info.languageServiceHost;
    const { logger } = info.project.projectService;

    const cache = createTypeCache({
        build,
        readFile: (resourcePath) => host.readFile(resourcePath),
        readDiskSidecar: diskSidecarOf,
        onGenerated: () => {
            info.project.markAsDirty();
            info.project.refreshDiagnostics();
        },
        onError: (error, resourcePath) =>
            logger.info(
                `rust-wasmpack-loader: type build failed for ${resourcePath}: ${error.message}`,
            ),
    });

    const overrides = buildHostOverrides({ tsm, host, cache });
    return tsm.createLanguageService(
        new Proxy(host, {
            get: (target, key) =>
                key in overrides ? overrides[key] : target[key],
        }),
    );
}

function init(modules, deps = {}) {
    const tsm = modules.typescript;
    const build = deps.buildTypedDts || buildTypedDts;
    return {
        create: (info) => create(info, { tsm, build }),
        getExternalFiles: (project) => project.getFileNames().filter(isRs),
    };
}

module.exports = init;
module.exports.createTypeCache = createTypeCache;
module.exports.buildHostOverrides = buildHostOverrides;
module.exports.FLOOR = FLOOR;
