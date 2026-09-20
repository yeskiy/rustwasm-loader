module.exports = async function stopAssetServer() {
    const server = globalThis.__assetServer;
    if (!server) {
        return;
    }
    await new Promise((resolve) => {
        server.close(resolve);
    });
};
