const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const DIST = path.resolve(__dirname, "..", "dist");
const CONTENT_TYPES = {
    ".wasm": "application/wasm",
    ".js": "text/javascript",
    ".html": "text/html",
};

// The `web` delivery with `asyncLoading` fetches the emitted `.wasm` from an
// absolute URL path. This server gives that path an origin, as a browser does.
// One bundle sets `output.publicPath` to `/assets/`, so the output folder also
// answers under that prefix, as a deployment behind that public path does.
module.exports = async () => {
    const server = http.createServer((request, response) => {
        const target = path.join(
            DIST,
            path.normalize(
                decodeURIComponent(
                    new URL(request.url, "http://127.0.0.1").pathname,
                ).replace(/^\/assets\//, "/"),
            ),
        );
        if (
            !target.startsWith(`${DIST}${path.sep}`) ||
            !fs.existsSync(target)
        ) {
            response.writeHead(404);
            response.end();
            return;
        }
        response.writeHead(200, {
            "content-type":
                CONTENT_TYPES[path.extname(target)] ??
                "application/octet-stream",
        });
        response.end(fs.readFileSync(target));
    });

    await new Promise((resolve) => {
        server.listen(0, "127.0.0.1", resolve);
    });

    globalThis.__assetServer = server;
    process.env.ASSET_ORIGIN = `http://127.0.0.1:${server.address().port}`;
};
