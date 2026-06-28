const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const FLOOR = path.join(__dirname, "..", "..", "types", "rs.d.ts");
const TSC = path.join(require.resolve("typescript"), "..", "..", "bin", "tsc");

function runTsc(projectDir) {
    return spawnSync(process.execPath, [TSC, "--noEmit", "-p", projectDir], {
        encoding: "utf8",
    });
}

// A throwaway TS project that imports a sidecar-less `.rs` and uses it loosely.
// With the floor in `files` the wildcard ambient module covers the import; the
// returned value is `any`, so assigning it to a typed const is accepted.
function scaffold(includeFloor) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rs-floor-"));
    fs.writeFileSync(path.join(dir, "thing.rs"), "// rust source\n");
    fs.writeFileSync(
        path.join(dir, "index.ts"),
        [
            'import mod from "./thing.rs";',
            "const value: number = mod.whatever(1, 2);",
            "export default value;",
            "",
        ].join("\n"),
    );
    fs.writeFileSync(
        path.join(dir, "tsconfig.json"),
        JSON.stringify({
            compilerOptions: {
                noEmit: true,
                strict: true,
                module: "esnext",
                moduleResolution: "bundler",
                skipLibCheck: true,
            },
            files: includeFloor ? ["index.ts", FLOOR] : ["index.ts"],
        }),
    );
    return dir;
}

test("a sidecar-less .rs import type-checks with the floor in scope", () => {
    const result = runTsc(scaffold(true));
    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
});

test("the same import without the floor is a hard error", () => {
    assert.notEqual(runTsc(scaffold(false)).status, 0);
});
