const test = require("node:test");
const assert = require("node:assert/strict");
const dtsToSidecar = require("./dtsTransform.util");

// Real wasm-bindgen 0.2.95 / wasm-pack 0.15 `--target web` `.d.ts` output for a
// crate exporting `cap`, `fibonacci`, and a `#[wasm_bindgen] struct Point`.
const FIXTURE = `/* tslint:disable */
/* eslint-disable */

export class Point {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    x: number;
    y: number;
}

export function cap(s: string): string;

export function fibonacci(n: number): number;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly cap: (a: number, b: number) => [number, number];
    readonly fibonacci: (a: number) => number;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
`;

test("emits a default-export object of the exported functions and classes", () => {
    const out = dtsToSidecar(FIXTURE);
    assert.match(out, /cap\(s: string\): string;/);
    assert.match(out, /fibonacci\(n: number\): number;/);
    assert.match(out, /Point: typeof Point;/);
    assert.doesNotMatch(out, /initSync|InitOutput|__wbg_init/);
    assert.match(out, /export default _default;/);
});

test("declares the class body, so its members carry their own types", () => {
    const out = dtsToSidecar(FIXTURE);
    assert.match(out, /declare class Point \{/);
    assert.match(out, /free\(\): void;/);
    assert.match(out, /x: number;/);
    assert.match(out, /y: number;/);
});

test("keeps a constructor signature, so the class stays constructible", () => {
    assert.match(
        dtsToSidecar(
            [
                "export class Point {",
                "  constructor(x: number, y: number);",
                "  norm(): number;",
                "}",
                "",
            ].join("\n"),
        ),
        /constructor\(x: number, y: number\);/,
    );
});

test("never exports the class by name (the runtime has a default only)", () => {
    // A named export here would type-check an import the loader never emits.
    assert.doesNotMatch(dtsToSidecar(FIXTURE), /export\s+(declare\s+)?class/);
});

test("produces no index signature (unknown members stay errors)", () => {
    assert.doesNotMatch(dtsToSidecar(FIXTURE), /\[key: string\]/);
});

test("preserves a Uint8Array param and a void return", () => {
    const out = dtsToSidecar(
        [
            "export function digest(data: Uint8Array): Uint8Array;",
            "export function noop(): void;",
            "",
        ].join("\n"),
    );
    assert.match(out, /digest\(data: Uint8Array\): Uint8Array;/);
    assert.match(out, /noop\(\): void;/);
});

test("strips JSDoc that precedes a function (wasm-bindgen 0.2.95 emits it)", () => {
    const out = dtsToSidecar(
        [
            "/**",
            " * @param {string} s",
            " * @returns {string}",
            " */",
            "export function cap(s: string): string;",
            "",
        ].join("\n"),
    );
    assert.match(out, /cap\(s: string\): string;/);
    assert.doesNotMatch(out, /@param/);
});

test("survives a multi-line signature", () => {
    const out = dtsToSidecar(
        [
            "export function compute(",
            "    a: number,",
            "    b: number",
            "): { sum: number; product: number };",
            "",
        ].join("\n"),
    );
    assert.match(out, /compute\(/);
    assert.match(out, /sum: number; product: number/);
});

test("returns an empty object body when there are no exported functions", () => {
    const out = dtsToSidecar("export interface Only { a: number; }\n");
    assert.match(out, /declare const _default: \{\s*\};/);
    assert.match(out, /export default _default;/);
});
