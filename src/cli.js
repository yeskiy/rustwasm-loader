const path = require("node:path");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const generateTypes = require("./utils/generateTypes.util");

const PREFIX = "rust-wasmpack-loader";
const DEFAULT_PATTERN = "**/*.rs";
const IGNORED_DIRS = new Set(["node_modules", "target", "pkg", "dist", ".git"]);
const WATCH_DEBOUNCE_MS = 50;

function isExcluded(entry) {
    return entry.split(/[\\/]/).some((segment) => IGNORED_DIRS.has(segment));
}

function pluralize(count) {
    return count === 1 ? "" : "s";
}

async function collectFiles(patterns) {
    const globs = patterns.length ? patterns : [DEFAULT_PATTERN];
    const matches = await globs.reduce(
        (chain, pattern) =>
            chain.then(async (acc) => {
                for await (const match of fsp.glob(pattern, {
                    exclude: isExcluded,
                })) {
                    if (match.endsWith(".rs")) acc.add(path.resolve(match));
                }
                return acc;
            }),
        Promise.resolve(new Set()),
    );
    return [...matches];
}

async function regenerate(file) {
    try {
        await generateTypes(file);
        console.log(`${PREFIX}: regenerated ${path.basename(file)}`);
    } catch (error) {
        console.error(`${PREFIX}: ${error.message}`);
    }
}

// Debounced fs.watch handler for one file: coalesces rapid saves into a single
// regeneration. Returned as a standalone handler so the watch wiring stays flat.
const scheduleRegen = (file, timers) => () => {
    clearTimeout(timers.get(file));
    timers.set(
        file,
        setTimeout(() => regenerate(file), WATCH_DEBOUNCE_MS),
    );
};

function watchFiles(files) {
    console.log(
        `${PREFIX}: watching ${files.length} file${pluralize(files.length)} for changes`,
    );
    const timers = new Map();
    files.forEach((file) => fs.watch(file, scheduleRegen(file, timers)));
}

async function genTypes(args) {
    const watch = args.includes("--watch");
    const files = await collectFiles(args.filter((arg) => arg !== "--watch"));
    if (!files.length) {
        console.log(`${PREFIX}: no .rs files matched`);
        return;
    }
    // Build one at a time: wasm-pack shells out to cargo and concurrent runs
    // contend on the shared registry cache, the same reason the loader serializes.
    await files.reduce(
        (chain, file) => chain.then(() => generateTypes(file)),
        Promise.resolve(),
    );
    console.log(
        `${PREFIX}: generated ${files.length} sidecar${pluralize(files.length)}`,
    );
    if (watch) watchFiles(files);
}

const COMMANDS = { "gen-types": genTypes };

module.exports = async function main(argv) {
    const [command, ...rest] = argv;
    const handler = COMMANDS[command];
    if (!handler) {
        const label = command ? `"${command}"` : "(none)";
        console.error(`${PREFIX}: unknown command ${label}`);
        console.error(`usage: ${PREFIX} gen-types [globs...] [--watch]`);
        process.exitCode = 1;
        return;
    }
    await handler(rest);
};
