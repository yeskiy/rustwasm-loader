const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");
const ts = require("typescript");
const init = require("./tsserver");

const { createTypeCache, buildHostOverrides, FLOOR } = init;

// Raw wasm-bindgen `--target web` `.d.ts` for a crate exporting two functions.
// The real `dtsToSidecar` turns this into the precise sidecar the cache serves.
const WBGEN_DTS = [
    "export function fibonacci(n: number): number;",
    "export function cap(s: string): string;",
    "",
].join("\n");

// A language-service host with just the methods the overrides delegate to. A
// sentinel snapshot lets a test prove non-`.rs` reads pass straight through.
const SENTINEL = ts.ScriptSnapshot.fromString("sentinel");

function mockHost(extra = {}) {
    return {
        getScriptKind: () => ts.ScriptKind.JS,
        getScriptVersion: () => "host-version",
        getScriptSnapshot: () => SENTINEL,
        readFile: () => "rust source",
        resolveModuleNameLiterals: (literals) =>
            literals.map(() => ({ resolvedModule: undefined })),
        ...extra,
    };
}

function makeCache(opts = {}) {
    return createTypeCache({
        build: async () => WBGEN_DTS,
        readFile: () => "rust source",
        readDiskSidecar: () => undefined,
        onGenerated: () => undefined,
        onError: () => undefined,
        ...opts,
    });
}

const snapshotText = (snapshot) => snapshot.getText(0, snapshot.getLength());

test("getScriptKind classifies .rs as TS and delegates the rest", () => {
    const overrides = buildHostOverrides({
        tsm: ts,
        host: mockHost(),
        cache: makeCache(),
    });
    assert.equal(overrides.getScriptKind("/a/math.rs"), ts.ScriptKind.TS);
    assert.equal(overrides.getScriptKind("/a/app.ts"), ts.ScriptKind.JS);
});

test("resolveModuleNameLiterals points .rs at a declaration, delegates others", () => {
    const overrides = buildHostOverrides({
        tsm: ts,
        host: mockHost(),
        cache: makeCache(),
    });
    const containing = path.join(os.tmpdir(), "app.ts");
    const [rs, other] = overrides.resolveModuleNameLiterals(
        [{ text: "./math.rs" }, { text: "./other" }],
        containing,
        undefined,
        {},
        {},
        undefined,
    );
    assert.equal(rs.resolvedModule.extension, ts.Extension.Dts);
    assert.equal(rs.resolvedModule.isExternalLibraryImport, false);
    assert.equal(
        rs.resolvedModule.resolvedFileName,
        path.resolve(path.dirname(containing), "./math.rs"),
    );
    assert.equal(other.resolvedModule, undefined);
});

test("getScriptSnapshot passes non-.rs reads straight through", () => {
    const overrides = buildHostOverrides({
        tsm: ts,
        host: mockHost(),
        cache: makeCache(),
    });
    assert.equal(overrides.getScriptSnapshot("/a/app.ts"), SENTINEL);
    assert.equal(overrides.getScriptVersion("/a/app.ts"), "host-version");
});

test("getScriptSnapshot serves the floor first, then the precise types", async () => {
    const cache = makeCache();
    const overrides = buildHostOverrides({ tsm: ts, host: mockHost(), cache });
    const rs = "/x/math.rs";

    const before = overrides.getScriptVersion(rs);
    assert.equal(snapshotText(overrides.getScriptSnapshot(rs)), FLOOR);

    await cache.pending();

    const after = overrides.getScriptSnapshot(rs);
    assert.match(snapshotText(after), /fibonacci\(n: number\): number;/);
    assert.doesNotMatch(snapshotText(after), /Record<string/);
    assert.notEqual(overrides.getScriptVersion(rs), before);
});

test("a completed build bumps the version and notifies once", async () => {
    const notified = [];
    const cache = makeCache({ onGenerated: (rp) => notified.push(rp) });
    const rs = "/x/math.rs";

    const before = cache.versionOf(rs);
    cache.snapshotOf(rs);
    cache.snapshotOf(rs);
    await cache.pending();

    assert.deepEqual(notified, [rs]);
    assert.notEqual(cache.versionOf(rs), before);
});

test("a failed build keeps the floor and reports the error", async () => {
    const errors = [];
    const cache = makeCache({
        build: async () => {
            throw new Error("wasm-pack boom");
        },
        onError: (error) => errors.push(error.message),
    });
    const rs = "/x/math.rs";

    assert.equal(cache.snapshotOf(rs), FLOOR);
    await cache.pending();
    assert.equal(cache.snapshotOf(rs), FLOOR);
    assert.deepEqual(errors, ["wasm-pack boom"]);
});

test("the on-disk sidecar overrides the floor before a build lands", () => {
    const cache = makeCache({
        readDiskSidecar: () =>
            "declare const _default: { onDisk(): void };\nexport default _default;\n",
    });
    assert.match(cache.snapshotOf("/x/math.rs"), /onDisk\(\): void/);
});

test("changing the source content changes the script version", () => {
    const sources = { value: "v1" };
    const cache = makeCache({ readFile: () => sources.value });
    const rs = "/x/math.rs";
    const first = cache.versionOf(rs);
    sources.value = "v2";
    assert.notEqual(cache.versionOf(rs), first);
});

test("getExternalFiles returns only the project's .rs files", () => {
    const plugin = init({ typescript: ts }, { buildTypedDts: async () => "" });
    const project = {
        getFileNames: () => [
            "/a/app.ts",
            "/a/math.rs",
            "/b/lib.rs",
            "/c/x.json",
        ],
    };
    assert.deepEqual(plugin.getExternalFiles(project), [
        "/a/math.rs",
        "/b/lib.rs",
    ]);
});
