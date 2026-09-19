const nativeFetch = globalThis.fetch;

// The glue asks for `/<name>.module.wasm`. Node needs an absolute URL, so the
// wrapper resolves the path against the origin of the test asset server.
globalThis.fetch = (resource, options) =>
    nativeFetch(
        typeof resource === "string" && resource.startsWith("/")
            ? new URL(resource, process.env.ASSET_ORIGIN)
            : resource,
        options,
    );
