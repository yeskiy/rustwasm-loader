import lib from "../math.rs";

export const runtime = lib;
export const fib10 = lib.fibonacci(10);
export const capped = lib.cap("hello");

const point = new lib.Point(3, 4);
export const pointX = point.x;
export const pointNorm = point.norm();
