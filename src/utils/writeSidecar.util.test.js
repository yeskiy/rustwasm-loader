const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const writeSidecar = require("./writeSidecar.util");

// wasm-bindgen `--target web` `.d.ts` for a crate exporting `cap`, `fibonacci`,
// and a `#[wasm_bindgen] struct Point`: the public functions plus the class,
// init, and raw-wasm noise the sidecar must drop.
const FIXTURE = [
    "export class Point {",
    "    private constructor();",
    "    x: number;",
    "}",
    "",
    "export function cap(s: string): string;",
    "",
    "export function fibonacci(n: number): number;",
    "",
    "export function initSync(module: SyncInitInput): InitOutput;",
    "",
].join("\n");

test("writes <stem>.d.rs.ts next to the source and returns its path", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rs-sidecar-"));
    try {
        const out = writeSidecar(path.join(dir, "math.rs"), FIXTURE);
        assert.equal(out, path.join(dir, "math.d.rs.ts"));
        const content = fs.readFileSync(out, "utf8");
        assert.match(content, /fibonacci\(n: number\): number;/);
        assert.match(content, /cap\(s: string\): string;/);
        assert.doesNotMatch(content, /Point|initSync|\[key: string\]/);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
