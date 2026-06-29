const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const ts = require("typescript");
const init = require("./tsserver");
const { buildTypedDts } = require("./utils/generateTypes.util");
const findWasmPack = require("./utils/findWasmPack.util");

const CRATE = path.join(__dirname, "..", "example", "typed-imports");

const skip = (() => {
    try {
        findWasmPack();
        return false;
    } catch {
        return "wasm-pack is not installed";
    }
})();

const COMPILER_OPTIONS = {
    noEmit: true,
    strict: true,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    allowArbitraryExtensions: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2020,
    types: [],
};

const IMPORTER = [
    'import lib from "./math.rs";',
    "export const ok = lib.fibonacci(1);",
    "export const bad = lib.nope();",
    "",
].join("\n");

// An isolated copy of the example crate with a unique marker, so the test owns
// its content-addressed build dir.
function isolatedCrate() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rs-ls-"));
    ["Cargo.toml", "Cargo.lock", "math.rs"].forEach((file) =>
        fs.copyFileSync(path.join(CRATE, file), path.join(dir, file)),
    );
    fs.appendFileSync(
        path.join(dir, "math.rs"),
        `\n// ${path.basename(dir)}\n`,
    );
    return dir;
}

function waitFor(predicate, timeoutMs) {
    const start = Date.now();
    const attempt = async () => {
        if (predicate()) return true;
        if (Date.now() - start > timeoutMs) return false;
        await new Promise((resolve) => {
            setTimeout(resolve, 100);
        });
        return attempt();
    };
    return attempt();
}

const messagesOf = (diagnostics) =>
    diagnostics.map((diagnostic) =>
        ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
    );

// A real `ts.createLanguageService` over a virtual host that holds the `.ts`
// importer and serves the rest (the `.rs` and the lib files) from disk. The
// plugin's `create` decorates it exactly as tsserver would.
function harness(dir) {
    // tsserver hands the host forward-slash paths, so key in-memory files the
    // same way and normalize every lookup.
    const toUnix = (file) => file.replace(/\\/g, "/");
    const importer = toUnix(path.join(dir, "app.ts"));
    const sources = new Map([[importer, IMPORTER]]);
    const refreshed = [];

    const readDisk = (file) =>
        fs.existsSync(file) ? fs.readFileSync(file, "utf8") : undefined;
    const read = (file) =>
        sources.has(toUnix(file)) ? sources.get(toUnix(file)) : readDisk(file);

    const host = {
        getCompilationSettings: () => COMPILER_OPTIONS,
        getScriptFileNames: () => [importer],
        getScriptKind: () => ts.ScriptKind.TS,
        getScriptVersion: () => "1",
        getScriptSnapshot: (file) => {
            const text = read(file);
            return text === undefined
                ? undefined
                : ts.ScriptSnapshot.fromString(text);
        },
        getCurrentDirectory: () => toUnix(dir),
        getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
        fileExists: (file) => sources.has(toUnix(file)) || fs.existsSync(file),
        readFile: read,
        readDirectory: () => [],
        resolveModuleNameLiterals: (literals, containingFile, _r, options) =>
            literals.map((literal) =>
                ts.resolveModuleName(
                    literal.text,
                    containingFile,
                    options,
                    host,
                ),
            ),
    };

    const project = {
        markAsDirty: () => undefined,
        refreshDiagnostics: () => refreshed.push(1),
        getFileNames: () => [...sources.keys()],
        projectService: { logger: { info: () => undefined } },
    };

    const languageService = init({ typescript: ts }, { buildTypedDts }).create({
        project,
        languageServiceHost: host,
        languageService: {},
        serverHost: {},
        config: {},
    });

    return { languageService, importer, refreshed };
}

test(
    "serves the floor first, then precise types that flag a bad call",
    { skip },
    async () => {
        const dir = isolatedCrate();
        const { languageService, importer, refreshed } = harness(dir);
        try {
            // Before the build lands, the floor keeps every member callable, so
            // the import (and the bad call) type-check loosely.
            assert.deepEqual(
                messagesOf(languageService.getSemanticDiagnostics(importer)),
                [],
            );

            // The first snapshot read enqueued the background build; wait for it
            // to finish and ask the project to refresh.
            assert.ok(
                await waitFor(() => refreshed.length > 0, 180000),
                "the background build never completed",
            );

            // The precise sidecar now overrides the floor. The only error is the
            // unknown export: `lib.nope()` is rejected, while the valid
            // `lib.fibonacci(1)` produces none (a bad call would be a second one).
            const messages = messagesOf(
                languageService.getSemanticDiagnostics(importer),
            );
            assert.equal(
                messages.length,
                1,
                `expected only the lib.nope() error, got: ${messages.join(" | ") || "(none)"}`,
            );
            assert.match(messages[0], /Property 'nope' does not exist/);
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    },
);
