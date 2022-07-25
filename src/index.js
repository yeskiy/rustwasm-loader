const fs = require("fs");
const loaderUtils = require("loader-utils");
const { parse: tomlToJson } = require("toml");
const jsonToToml = require("json2toml");
const path = require("path");
const { spawn } = require("child_process");
const md5 = require("md5");
const os = require("os");
const which = require("which");

const CONFIG_NAMING = "Cargo.toml";

/* Referenced From: https://github.com/wasm-tool/wasm-pack-plugin/blob/64c2840db0cccd77d0af26813176e55ed38cff69/plugin.js */
function findWasmPack() {
    // https://github.com/wasm-tool/wasm-pack-plugin/issues/58
    if (process.env.WASM_PACK_PATH !== undefined) {
        return process.env.WASM_PACK_PATH;
    }

    const inPath = which.sync("wasm-pack", { nothrow: true });
    if (inPath) {
        return inPath;
    }

    const inCargo = path.join(os.homedir(), ".cargo", "bin", "wasm-pack");
    if (fs.existsSync(inCargo)) {
        return inCargo;
    }
    throw new Error("Could not find Wasm Pack");
}

/* Referenced From: https://github.com/wasm-tool/wasm-pack-plugin/blob/64c2840db0cccd77d0af26813176e55ed38cff69/plugin.js */
async function runProcess(bin, args, options) {
    return new Promise((resolve, reject) => {
        const p = spawn(bin, args, options);

        p.on("close", (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error("Rust compilation."));
            }
        });

        p.on("error", reject);
    });
}

/* Referenced From: https://github.com/wasm-tool/wasm-pack-plugin/blob/64c2840db0cccd77d0af26813176e55ed38cff69/plugin.js */
function spawnWasmPack({
    outDir,
    outName,
    isDebug,
    cwd,
    args = [],
    extraArgs = [],
}) {
    const bin = findWasmPack();

    const allArgs = [
        ...args,
        "build",
        "--out-dir",
        outDir,
        "--out-name",
        outName,
        ...(isDebug ? ["--dev"] : []),
        ...extraArgs,
    ];

    const options = {
        cwd,
        stdio: "inherit",
    };

    return runProcess(bin, allArgs, options);
}

function findNearestCargoSync(name, pathFolder, end, originEntry, hash) {
    const stepDown = () => {
        if (path.normalize(pathFolder) === end) {
            throw new Error(`Cannot Find "${CONFIG_NAMING}" to create wasm`);
        } else {
            return findNearestCargoSync(
                name,
                path.resolve(pathFolder, "../"),
                end,
                originEntry,
                hash
            );
        }
    };

    const complete = (data) => {
        const tmp = os.tmpdir();
        const tmpFolder = path.join(tmp, `${name}.${hash}`);
        if (!fs.existsSync(tmpFolder)) {
            fs.mkdirSync(tmpFolder, { recursive: true });
        }
        return {
            toml: jsonToToml(
                {
                    ...data,
                    lib: {
                        ...data.lib,
                        path: path
                            .relative(tmpFolder, originEntry)
                            .split(path.sep)
                            .join(path.posix.sep),
                    },
                },
                { indent: 2, newlineAfterSection: true }
            ),
            genFrom: tmpFolder,
        };
    };
    if (fs.existsSync(path.join(pathFolder, CONFIG_NAMING))) {
        const data = tomlToJson(
            fs.readFileSync(path.join(pathFolder, CONFIG_NAMING), {
                encoding: "utf8",
            })
        );
        if (data.lib.path) {
            const fullPath = path.resolve(pathFolder, data.package.path);
            if (path.normalize(fullPath) === originEntry) {
                return complete(data);
            }
            return stepDown();
        }
        return complete(data);
    }
    return stepDown();
}

module.exports = async function rustWasmLoader(source) {
    const callback = this.async();

    try {
        const values = {
            outputPath: this._compilation.outputOptions.path,
            fileNameStruct:
                this._compilation.outputOptions.webassemblyModuleFilename,
            baseFolder: this._compilation.options.context,
            resourcePath: this.resourcePath,
        };
        const wasmName = loaderUtils.interpolateName(
            this,
            values.fileNameStruct,
            {
                content: source,
            }
        );

        const { base, dir } = path.parse(path.normalize(values.resourcePath));
        const cargoData = findNearestCargoSync(
            base,
            dir,
            path.normalize(values.baseFolder),
            path.normalize(values.resourcePath),
            md5(source)
        );
        fs.writeFileSync(
            path.join(cargoData.genFrom, CONFIG_NAMING),
            cargoData.toml,
            {
                encoding: "utf8",
            }
        );

        const wasmDestination = path.join(cargoData.genFrom, "pkg");
        await spawnWasmPack({
            cwd: cargoData.genFrom,
            outDir: wasmDestination,
            outName: wasmName,
            extraArgs: ["--target", "nodejs", "--no-typescript"],
        });

        await new Promise((resolve) => {
            setTimeout(resolve, 100);
        });

        const bindSource = `${fs
            .readFileSync(
                path.join(
                    wasmDestination,
                    `${wasmName.replace(".wasm", "")}.js`
                ),
                {
                    encoding: "utf8",
                }
            )
            .replace("_bg.wasm", "")}
            const usedExportValues = Object.keys(module.exports).filter(item=> item !== "__wasm");
            module.exports = {...Object.keys(wasm).filter(item=> usedExportValues.indexOf(item) === -1).reduce((acc, item)=> ({...acc, [item]: wasm[item]}), {}), ...usedExportValues.reduce((acc, item)=>({...acc, [item]:module.exports[item] }),{})}`;

        this.emitFile(
            wasmName,
            fs.readFileSync(path.join(wasmDestination, wasmName))
        );
        callback(null, bindSource);
    } catch (e) {
        callback(e, null);
    }
};
