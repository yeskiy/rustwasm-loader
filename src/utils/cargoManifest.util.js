const fs = require("node:fs");
const path = require("node:path");
const { parse } = require("smol-toml");

const CARGO_TOML = "Cargo.toml";
const CARGO_LOCK = "Cargo.lock";

const DEPENDENCY_TABLES = [
    "dependencies",
    "dev-dependencies",
    "dev_dependencies",
    "build-dependencies",
    "build_dependencies",
];
const TARGET_ARRAYS = ["bin", "example", "test", "bench"];
const ROOT_ONLY = ["patch", "replace", "profile"];
// The `[workspace.package]` fields whose paths are relative to the workspace root.
const ROOT_RELATIVE_FIELDS = new Set(["readme", "license-file"]);

const readManifest = (folder) =>
    parse(fs.readFileSync(path.join(folder, CARGO_TOML), "utf8"));

const hasManifest = (folder) => fs.existsSync(path.join(folder, CARGO_TOML));

// An absolute path with forward slashes, which cargo reads on every platform.
const absolute = (folder, file) =>
    path.resolve(folder, file).split(path.sep).join(path.posix.sep);

const mapEntries = (table, fn) =>
    Object.fromEntries(
        Object.entries(table).map(([key, value]) => [key, fn(value, key)]),
    );

const pickDefined = (table, keys) =>
    Object.fromEntries(
        keys
            .filter((key) => table[key] !== undefined)
            .map((key) => [key, table[key]]),
    );

// Applies `fn` to each dependency table, at the top level and under each `target.<cfg>`.
const mapDependencyTables = (manifest, fn) => ({
    ...manifest,
    ...mapEntries(pickDefined(manifest, DEPENDENCY_TABLES), fn),
    ...(manifest.target
        ? {
              target: mapEntries(manifest.target, (table) =>
                  mapDependencyTables(table, fn),
              ),
          }
        : {}),
});

const withAbsolutePath = (folder) => (entry) =>
    typeof entry?.path === "string"
        ? { ...entry, path: absolute(folder, entry.path) }
        : entry;

// The build script as cargo finds it: `package.build`, else a `build.rs` next to the manifest.
function buildScript(build, folder) {
    if (typeof build === "string") {
        return absolute(folder, build);
    }
    if (Array.isArray(build)) {
        return build.map((file) => absolute(folder, file));
    }
    return build === undefined && fs.existsSync(path.join(folder, "build.rs"))
        ? absolute(folder, "build.rs")
        : build;
}

function rewritePackage({ workspace, ...pkg }, folder) {
    const build = buildScript(pkg.build, folder);
    return {
        ...mapEntries(pkg, (value, key) =>
            ROOT_RELATIVE_FIELDS.has(key) && typeof value === "string"
                ? absolute(folder, value)
                : value,
        ),
        ...(build === undefined ? {} : { build }),
    };
}

// Resolves the relative paths of a manifest against its folder, so that the manifest
// works from any folder. It also drops `package.workspace`.
function rewritePaths(manifest, folder) {
    const fixPath = withAbsolutePath(folder);
    const fixTable = (table) => mapEntries(table, fixPath);
    return {
        ...mapDependencyTables(manifest, fixTable),
        ...(manifest.package
            ? { package: rewritePackage(manifest.package, folder) }
            : {}),
        ...(manifest.patch
            ? { patch: mapEntries(manifest.patch, fixTable) }
            : {}),
        ...(manifest.replace ? { replace: fixTable(manifest.replace) } : {}),
        ...mapEntries(
            pickDefined(
                manifest,
                TARGET_ARRAYS.filter((key) => Array.isArray(manifest[key])),
            ),
            (targets) => targets.map(fixPath),
        ),
    };
}

function isWithin(parent, child) {
    const relative = path.relative(parent, child);
    return !relative.startsWith("..") && !path.isAbsolute(relative);
}

const pathDependencies = (table = {}) =>
    Object.values(table)
        .map((entry) => entry?.path)
        .filter((file) => typeof file === "string");

// The folders of the path dependencies of a manifest, with the patch and replace entries.
const dependencyFolders = (manifest, folder) =>
    [
        ...DEPENDENCY_TABLES.flatMap((key) => pathDependencies(manifest[key])),
        ...Object.values(manifest.target ?? {}).flatMap((table) =>
            DEPENDENCY_TABLES.flatMap((key) => pathDependencies(table[key])),
        ),
        ...Object.values(manifest.patch ?? {}).flatMap(pathDependencies),
        ...pathDependencies(manifest.replace),
    ].map((file) => path.resolve(folder, file));

const explicitMembers = (rootFolder, workspace) =>
    (workspace.members ?? [])
        .flatMap((pattern) => fs.globSync(pattern, { cwd: rootFolder }))
        .map((member) => path.resolve(rootFolder, member));

const listedIn = (rootFolder, entries, crateFolder) =>
    (entries ?? []).some((entry) =>
        isWithin(path.resolve(rootFolder, entry), crateFolder),
    );

// Cargo excludes a crate under an `exclude` entry, unless a literal `members` entry holds it.
const excludedBy = (rootFolder, workspace, crateFolder) =>
    listedIn(rootFolder, workspace.exclude, crateFolder) &&
    !listedIn(rootFolder, workspace.members, crateFolder);

// A member is a crate that `members` matches, or a path dependency of the root package
// inside the root folder. An `exclude` entry removes it.
function isMember(crateFolder, root) {
    const { folder, manifest } = root;
    return (
        !excludedBy(folder, manifest.workspace, crateFolder) &&
        (explicitMembers(folder, manifest.workspace).includes(crateFolder) ||
            (isWithin(folder, crateFolder) &&
                DEPENDENCY_TABLES.flatMap((key) =>
                    pathDependencies(manifest[key]),
                )
                    .map((file) => path.resolve(folder, file))
                    .includes(crateFolder)))
    );
}

// The nearest ancestor manifest with a `[workspace]` table that does not exclude the crate.
function ancestorRoot(folder, crateFolder) {
    const manifest = hasManifest(folder) ? readManifest(folder) : null;
    if (
        manifest?.workspace &&
        !excludedBy(folder, manifest.workspace, crateFolder)
    ) {
        return { folder, manifest };
    }
    const parent = path.dirname(folder);
    return parent === folder ? null : ancestorRoot(parent, crateFolder);
}

// Finds the workspace root of a crate the way cargo does. It returns null for a crate
// that is not a workspace member.
function findWorkspaceRoot(crateFolder, manifest) {
    if (manifest.workspace) {
        return { folder: crateFolder, manifest };
    }
    const explicitRoot = manifest.package?.workspace;
    const root =
        typeof explicitRoot === "string"
            ? {
                  folder: path.resolve(crateFolder, explicitRoot),
                  manifest: readManifest(
                      path.resolve(crateFolder, explicitRoot),
                  ),
              }
            : ancestorRoot(path.dirname(crateFolder), crateFolder);
    return root?.manifest.workspace && isMember(crateFolder, root)
        ? root
        : null;
}

function inheritedField(key, workspace, rootFolder) {
    const value = workspace.package?.[key];
    if (value === undefined) {
        throw new Error(
            `"${key}" is not in [workspace.package] of the workspace at "${rootFolder}"`,
        );
    }
    return ROOT_RELATIVE_FIELDS.has(key) && typeof value === "string"
        ? absolute(rootFolder, value)
        : value;
}

const inheritDependency = (workspace, rootFolder) => (entry, name) => {
    if (entry?.workspace !== true) {
        return entry;
    }
    const shared = workspace.dependencies?.[name];
    if (shared === undefined) {
        throw new Error(
            `"${name}" is not in [workspace.dependencies] of the workspace at "${rootFolder}"`,
        );
    }
    const base =
        typeof shared === "string"
            ? { version: shared }
            : withAbsolutePath(rootFolder)(shared);
    const { features = [], ...rest } = entry;
    const merged = [...new Set([...(base.features ?? []), ...features])];
    return {
        ...base,
        ...Object.fromEntries(
            Object.entries(rest).filter(([key]) => key !== "workspace"),
        ),
        ...(merged.length ? { features: merged } : {}),
    };
};

// Replaces each `workspace = true` field and dependency with the value of the workspace root.
const inheritWorkspace = (manifest, workspace, rootFolder) => ({
    ...mapDependencyTables(manifest, (table) =>
        mapEntries(table, inheritDependency(workspace, rootFolder)),
    ),
    ...(manifest.package
        ? {
              package: mapEntries(manifest.package, (value, key) =>
                  value?.workspace === true
                      ? inheritedField(key, workspace, rootFolder)
                      : value,
              ),
          }
        : {}),
    ...(manifest.lints?.workspace === true
        ? { lints: workspace.lints ?? {} }
        : {}),
});

// Builds a manifest that works from any folder, with the root-only sections of the workspace
// root. Its empty `[workspace]` stops cargo from a search for a root above the build folder.
function resolveManifest(crateFolder) {
    const manifest = readManifest(crateFolder);
    const root = findWorkspaceRoot(crateFolder, manifest);
    const { folder: rootFolder, manifest: rootManifest } = root ?? {
        folder: crateFolder,
        manifest: { ...manifest, workspace: {} },
    };
    const own = Object.fromEntries(
        Object.entries(manifest).filter(
            ([key]) => key !== "workspace" && !ROOT_ONLY.includes(key),
        ),
    );
    return {
        manifest: {
            ...rewritePaths(
                inheritWorkspace(own, rootManifest.workspace, rootFolder),
                crateFolder,
            ),
            ...rewritePaths(pickDefined(rootManifest, ROOT_ONLY), rootFolder),
            workspace: pickDefined(rootManifest.workspace, ["resolver"]),
        },
        rootFolder: root ? rootFolder : null,
    };
}

// Collects the folders of the local path dependencies, through their own path dependencies.
function pathDependencyFolders(crateFolder, seen = new Set([crateFolder])) {
    dependencyFolders(resolveManifest(crateFolder).manifest, crateFolder)
        .filter((folder) => !seen.has(folder) && hasManifest(folder))
        .forEach((folder) => {
            seen.add(folder);
            pathDependencyFolders(folder, seen);
        });
    return [...seen].filter((folder) => folder !== crateFolder);
}

// The cargo files that a build of the crate reads: the lock it builds against, and the
// manifests of the workspace root and of the local path dependencies.
function cargoInputsFor(crateFolder) {
    const { rootFolder } = resolveManifest(crateFolder);
    return {
        lock: path.join(rootFolder ?? crateFolder, CARGO_LOCK),
        manifests: [
            ...(rootFolder && rootFolder !== crateFolder ? [rootFolder] : []),
            ...pathDependencyFolders(crateFolder),
        ]
            .map((folder) => path.join(folder, CARGO_TOML))
            .filter((file, index, files) => files.indexOf(file) === index)
            .sort((a, b) => Number(a > b) - Number(a < b)),
    };
}

module.exports = {
    CARGO_TOML,
    CARGO_LOCK,
    readManifest,
    rewritePaths,
    findWorkspaceRoot,
    inheritWorkspace,
    resolveManifest,
    pathDependencyFolders,
    cargoInputsFor,
};
