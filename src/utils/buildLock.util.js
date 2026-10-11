const fs = require("node:fs");
const path = require("node:path");

const OWNER_FILE = "owner.json";
const POLL_MS = 100;
// The holder restamps its owner file every HEARTBEAT_MS. A waiter takes over a lock with no stamp
// for STALE_MS, because the pid of a dead owner can belong to an unrelated process.
const HEARTBEAT_MS = 1000;
const STALE_MS = 5 * 60 * 1000;

// Lock directories that this process owns, with their heartbeat timers. A nested acquisition
// from the two-pass import delivery reuses the outer lock, so that it does not wait on itself.
const owned = new Map();

const delay = (ms) =>
    new Promise((resolve) => {
        setTimeout(resolve, ms);
    });

const isRunning = (pid) => {
    try {
        process.kill(pid, 0);
        return true;
    } catch (error) {
        return error.code === "EPERM";
    }
};

const readOwner = (lockDir) => {
    try {
        return JSON.parse(
            fs.readFileSync(path.join(lockDir, OWNER_FILE), "utf8"),
        );
    } catch {
        return null;
    }
};

const stamp = (lockDir) => {
    fs.writeFileSync(
        path.join(lockDir, OWNER_FILE),
        JSON.stringify({ pid: process.pid, at: Date.now() }),
    );
};

const isAbandoned = (lockDir) => {
    const owner = readOwner(lockDir);
    if (owner && Number.isInteger(owner.pid) && owner.pid > 0) {
        return (
            !isRunning(owner.pid) || Date.now() - Number(owner.at) > STALE_MS
        );
    }
    try {
        return Date.now() - fs.statSync(lockDir).mtimeMs > STALE_MS;
    } catch {
        return false;
    }
};

const acquire = async (lockDir) => {
    try {
        fs.mkdirSync(lockDir);
        stamp(lockDir);
        return;
    } catch (error) {
        if (error.code !== "EEXIST") {
            throw error;
        }
    }
    if (isAbandoned(lockDir)) {
        fs.rmSync(lockDir, { recursive: true, force: true });
    }
    await delay(POLL_MS);
    await acquire(lockDir);
};

// Runs `task` under a cross-process `mkdir` lock on `buildFolder`. Two wasm-pack runs in one
// directory fail, and Turbopack runs loader passes in separate worker processes.
async function withBuildLock(buildFolder, task) {
    const lockDir = `${buildFolder}.lock`;
    if (owned.has(lockDir)) {
        return task();
    }
    await acquire(lockDir);
    owned.set(
        lockDir,
        setInterval(() => {
            try {
                stamp(lockDir);
            } catch {
                // The lock directory is gone. The release in `finally` handles it.
            }
        }, HEARTBEAT_MS).unref(),
    );
    try {
        return await task();
    } finally {
        clearInterval(owned.get(lockDir));
        owned.delete(lockDir);
        fs.rmSync(lockDir, { recursive: true, force: true });
    }
}

// The in-process queue of each target lock, so that two tasks of one process take turns.
const targetQueues = new Map();

// Runs `task` while no other task of this or another process holds `lockPath`.
// Unlike `withBuildLock`, a second task of the same process waits.
function withTargetLock(lockPath, task) {
    const run = (targetQueues.get(lockPath) || Promise.resolve()).then(() =>
        withBuildLock(lockPath, task),
    );
    const settled = run.then(
        () => undefined,
        () => undefined,
    );
    targetQueues.set(lockPath, settled);
    settled.then(() => {
        if (targetQueues.get(lockPath) === settled) {
            targetQueues.delete(lockPath);
        }
    });
    return run;
}

module.exports = withBuildLock;
module.exports.withTargetLock = withTargetLock;
