module.exports = {
    testEnvironment: "node",
    testMatch: ["<rootDir>/dist/comp*.test.js", "<rootDir>/test/*.test.js"],
    globalSetup: "<rootDir>/test/startAssetServer.js",
    globalTeardown: "<rootDir>/test/stopAssetServer.js",
    setupFiles: ["<rootDir>/test/assetFetch.js"],
};
