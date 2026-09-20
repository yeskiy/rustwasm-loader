const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const withBuildLock = require("./buildLock.util");

const scratch = () => fs.mkdtempSync(path.join(os.tmpdir(), "rs-lock-"));

const delay = (ms) =>
    new Promise((resolve) => {
        setTimeout(resolve, ms);
    });

test("holds the lock directory for the duration of the task", async () => {
    const dir = scratch();
    try {
        const buildFolder = path.join(dir, "build");
        const lockDir = `${buildFolder}.lock`;
        const seenInside = await withBuildLock(buildFolder, () =>
            fs.existsSync(lockDir),
        );
        assert.equal(seenInside, true);
        assert.equal(fs.existsSync(lockDir), false);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test("releases the lock when the task throws", async () => {
    const dir = scratch();
    try {
        const buildFolder = path.join(dir, "build");
        await assert.rejects(
            withBuildLock(buildFolder, () => {
                throw new Error("boom");
            }),
            /boom/,
        );
        assert.equal(fs.existsSync(`${buildFolder}.lock`), false);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test("serializes overlapping tasks on the same build folder", async () => {
    const dir = scratch();
    try {
        const buildFolder = path.join(dir, "build");
        const order = [];
        const task = (name) => async () => {
            order.push(`${name}:start`);
            await delay(30);
            order.push(`${name}:end`);
        };
        await Promise.all([
            withBuildLock(buildFolder, task("a")),
            withBuildLock(buildFolder, task("b")),
        ]);
        assert.equal(order.length, 4);
        assert.equal(order[1], order[0].replace(":start", ":end"));
        assert.equal(order[3], order[2].replace(":start", ":end"));
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test("runs tasks on different build folders concurrently", async () => {
    const dir = scratch();
    try {
        const order = [];
        const task = (name) => async () => {
            order.push(`${name}:start`);
            await delay(30);
            order.push(`${name}:end`);
        };
        await Promise.all([
            withBuildLock(path.join(dir, "one"), task("a")),
            withBuildLock(path.join(dir, "two"), task("b")),
        ]);
        assert.deepEqual(order, ["a:start", "b:start", "a:end", "b:end"]);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test("re-enters the same lock without deadlocking and releases once", async () => {
    const dir = scratch();
    try {
        const buildFolder = path.join(dir, "build");
        const lockDir = `${buildFolder}.lock`;
        const stillLocked = await withBuildLock(buildFolder, async () => {
            await withBuildLock(buildFolder, () => delay(10));
            return fs.existsSync(lockDir);
        });
        assert.equal(stillLocked, true);
        assert.equal(fs.existsSync(lockDir), false);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test("restamps the owner file while the task runs", async () => {
    const dir = scratch();
    try {
        const buildFolder = path.join(dir, "build");
        const ownerFile = path.join(`${buildFolder}.lock`, "owner.json");
        const stamps = await withBuildLock(buildFolder, async () => {
            const first = JSON.parse(fs.readFileSync(ownerFile, "utf8")).at;
            await delay(1400);
            return [first, JSON.parse(fs.readFileSync(ownerFile, "utf8")).at];
        });
        assert.ok(
            stamps[1] > stamps[0],
            `expected the owner stamp to advance, got ${stamps.join(" then ")}`,
        );
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test("takes over a lock whose owner process is gone", async () => {
    const dir = scratch();
    try {
        const buildFolder = path.join(dir, "build");
        const lockDir = `${buildFolder}.lock`;
        fs.mkdirSync(lockDir, { recursive: true });
        fs.writeFileSync(
            path.join(lockDir, "owner.json"),
            JSON.stringify({ pid: 0x7ffffffe, at: Date.now() }),
        );
        const ran = await withBuildLock(buildFolder, () => true);
        assert.equal(ran, true);
        assert.equal(fs.existsSync(lockDir), false);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test("waits for a lock held by another process", async () => {
    const dir = scratch();
    try {
        const buildFolder = path.join(dir, "build");
        const holder = spawn(
            process.execPath,
            [
                "-e",
                `const withBuildLock = require(${JSON.stringify(path.join(__dirname, "buildLock.util.js"))});
                 withBuildLock(${JSON.stringify(buildFolder)}, async () => {
                     process.send ? process.send("held") : console.log("held");
                     await new Promise((r) => setTimeout(r, 700));
                 });`,
            ],
            { stdio: ["ignore", "pipe", "inherit"] },
        );
        const closed = new Promise((resolve) => {
            holder.once("close", resolve);
        });
        await new Promise((resolve) => {
            holder.stdout.once("data", resolve);
        });

        const started = Date.now();
        await withBuildLock(buildFolder, () => undefined);
        const waited = Date.now() - started;

        await closed;
        assert.ok(
            waited > 300,
            `expected to wait for the other process, waited ${waited}ms`,
        );
        assert.equal(fs.existsSync(`${buildFolder}.lock`), false);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
