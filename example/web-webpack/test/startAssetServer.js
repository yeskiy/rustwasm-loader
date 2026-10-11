const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const DIST = path.resolve(__dirname, "..", "dist");
const CONTENT_TYPES = {
    ".wasm": "application/wasm",
    ".js": "text/javascript",
    ".html": "text/html",
};

// Serves the output folder for the `asyncLoading` wasm fetch, at the root and
// under `/assets/`, the public path of one bundle.
module.exports = async function startAssetServer() {
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
