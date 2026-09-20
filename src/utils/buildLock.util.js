const fs = require("node:fs");
const path = require("node:path");

const OWNER_FILE = "owner.json";
const POLL_MS = 100;
// The holder restamps its owner file on this interval. A waiter that sees no
// stamp for STALE_MS takes the lock over, which bounds the wait when the owner
// pid died and the operating system gave the number to an unrelated process.
const HEARTBEAT_MS = 1000;
const STALE_MS = 5 * 60 * 1000;

// Lock directories this process already owns, each with its heartbeat timer. The
// two-pass import delivery wraps the passes it makes, so a nested acquisition
// reuses the outer lock. Without that it would wait on itself.
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

/**
 * Runs `task` while this process holds an exclusive lock on `buildFolder`.
 *
 * wasm-pack owns the whole build directory. It deletes `pkg/package.json` early
 * in a build and reads the same file back at the end. Two wasm-pack runs over one
 * directory therefore make the slower run parse the file of the faster run, and
 * that run fails. The directory is content-addressed, so every build of the same
 * `.rs` shares it. Turbopack runs its loader passes in separate Node worker
 * processes, so the lock must be visible outside this process.
 *
 * An atomic `mkdir` gives that with no new dependency. A lock left behind by a
 * killed build is taken over when its owner process is gone.
 * @template T
 * @param {string} buildFolder - the build directory to lock
 * @param {() => T | Promise<T>} task - runs while the lock is held
 * @returns {Promise<T>} whatever `task` returns
 */
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
                // the lock directory is gone. The release below handles it
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

module.exports = withBuildLock;
