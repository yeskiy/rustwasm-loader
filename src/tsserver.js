/**
 * tsserver Language Service plugin: gives `.rs` imports their precise
 * wasm-bindgen types live in any tsserver-based editor (VS Code, JetBrains,
 * Neovim) with no editor extension. A `.rs` file masquerades as a TypeScript
 * declaration: module resolution points `import x from "./foo.rs"` at the `.rs`
 * itself, `getScriptKind` reports it as TS, and `getScriptSnapshot` serves the
 * generated `.d.ts`.
 *
 * The generator is a wasm-pack build, so it is slow. Synchronous language-service
 * calls never block on it: they serve the cached, on-disk, or floor types right
 * away and enqueue a background build. When the build lands, the per-file version
 * counter bumps and the project is asked to refresh, so the editor repaints with
 * the precise types a moment later.
 *
 * The plugin never writes to disk (the M1/M2 on-disk sidecar already serves
 * `tsc`, ESLint, and cold start); it only reads that sidecar to warm its cache.
 *
 * VS Code note: the editor must run the workspace TypeScript ("TypeScript:
 * Select TypeScript Version" -> "Use Workspace Version"), since plugins load from
 * the active tsserver. Because the first build lags the first import, a fresh
 * `.rs` shows the loose floor until the build finishes; saving the file once more
 * after it lands refreshes the precise types.
 */
const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");
const dtsToSidecar = require("./utils/dtsTransform.util");
const { buildTypedDts } = require("./utils/generateTypes.util");

// The loose floor served for a `.rs` module before its precise types finish
// building, and the fallback if a build fails. Every export is callable, so the
// import never errors; the generated sidecar overrides it once the build lands.
const FLOOR = [
    "declare const _default: Record<string, (...args: any[]) => any>;",
    "export default _default;",
    "",
].join("\n");

const isRs = (fileName) => fileName.endsWith(".rs");

const hashOf = (text) => crypto.createHash("sha256").update(text).digest("hex");

// Reads the M1/M2 on-disk sidecar (`<stem>.d.rs.ts`) if a prior build, the CLI,
// or a bundler left one, so a cold editor shows precise types before its own
// background build finishes.
function diskSidecarOf(resourcePath) {
    const { dir, name } = path.parse(resourcePath);
    const sidecar = path.join(dir, `${name}.d.rs.ts`);
    return fs.existsSync(sidecar)
        ? fs.readFileSync(sidecar, "utf8")
        : undefined;
}

/**
 * The async type cache. `versionOf`/`snapshotOf` are synchronous and never block:
 * they serve the cached, on-disk, or floor types and enqueue a background build,
 * deduped by content hash. On completion the per-file counter bumps (so the
 * script version changes) and `onGenerated` fires so the host can refresh.
 */
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

// Layers `.rs` handling over the real host: `.rs` reads come from the cache, the
// rest pass through. Only the resolution method the host already implements is
// wrapped, so `.rs` specifiers resolve to a declaration while every other import
// keeps the host's own resolution.
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
