import lib from "../math.rs";

// Correct usage is accepted.
export const ok = lib.fibonacci(10);
export const point = new lib.Point(3, 4);

// @ts-expect-error - `nope` is not a generated export, so the precise sidecar
// must reject it. If the directive ever goes unused, tsc fails this file.
export const bad = lib.nope();

// @ts-expect-error - the class is declared member by member, so an unknown
// member on an instance is a type error too.
export const badMember = point.nope;
