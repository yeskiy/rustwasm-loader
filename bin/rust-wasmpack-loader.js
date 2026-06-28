#!/usr/bin/env node
require("../src/cli")(process.argv.slice(2)).catch((error) => {
    console.error(`rust-wasmpack-loader: ${error.message}`);
    process.exitCode = 1;
});
