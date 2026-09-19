import rsLib from "../../../lib.rs";

// Edge ROUTE HANDLER importing the SAME `.rs`, through the same `module`
// delivery the Edge page takes. Next.js 15 builds and serves this handler under
// both bundlers, which Next.js 16.3 cannot do with `next build --webpack`.
export const runtime = "edge";

const NUM = 6;

export function GET() {
    return Response.json({
        triangular: rsLib.triangular(NUM),
        shout: rsLib.shout("route"),
    });
}
