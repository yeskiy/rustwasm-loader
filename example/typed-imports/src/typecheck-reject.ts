import lib from "../math.rs";

// Correct usage is accepted.
export const ok = lib.fibonacci(10);

// @ts-expect-error - `nope` is not a generated export, so the precise sidecar
// must reject it. If the directive ever goes unused, tsc fails this file.
export const bad = lib.nope();
