import rsLib from "../../../lib.rs";

// Edge route handler that imports the same `.rs` through the `module` delivery.
// Next.js 15 builds it under both bundlers. Next.js 16.3 with `--webpack` cannot.
export const runtime = "edge";

const NUM = 6;

export function GET() {
    return Response.json({
        triangular: rsLib.triangular(NUM),
        shout: rsLib.shout("route"),
    });
}
