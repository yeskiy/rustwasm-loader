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

test("emits a default-export object of only the exported functions", () => {
    const out = dtsToSidecar(FIXTURE);
    assert.match(out, /cap\(s: string\): string;/);
    assert.match(out, /fibonacci\(n: number\): number;/);
    assert.doesNotMatch(out, /Point/);
    assert.doesNotMatch(out, /initSync|InitOutput|__wbg_init/);
    assert.match(out, /export default _default;/);
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
