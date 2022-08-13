const fs = require("fs");
const loaderUtils = require("loader-utils");
const path = require("path");
const crypto = require("crypto");
const os = require("os");
const spawnWasmPack = require("./utils/spawnWasmPack.util");
const findNearestCargoBy = require("./utils/findNearestCargo.util");

const constants = Object.seal({
    CARGO_LOCK: "Cargo.toml",
    CARGO_TOML: "Cargo.lock",
});

module.exports = async function rustWasmLoader(source) {
    const callback = this.async();

    try {
        // Get all required values from webpack
        const values = {
            outputPath: this._compilation.outputOptions.path,
            fileNameStruct:
                this._compilation.outputOptions.webassemblyModuleFilename,
            baseFolder: this._compilation.options.context,
            resourcePath: this.resourcePath,
        };

        // Get base and dir from rescources
        const { base, dir } = path.parse(path.normalize(values.resourcePath));

        // Create name of wasm file
        const wasmName = loaderUtils.interpolateName(
            this,
            values.fileNameStruct,
            {
                content: source,
            }
        );

        // Create build folder and name with md5 of source
        const tmp = os.tmpdir();
        const buildFolder = path.join(
            tmp,
            `${base}.${crypto.createHash("md5").update(source).digest("hex")}`
        );
        const wasmBuildSource = path.join(buildFolder, "pkg");

        if (!fs.existsSync(buildFolder)) {
            fs.mkdirSync(buildFolder, { recursive: true });
        }

        // Find the nearest Cargo.toml file
        const cargoData = findNearestCargoBy(constants)(
            dir,
            path.normalize(values.baseFolder),
            path.normalize(values.resourcePath),
            buildFolder
        );

        // Write files to build dir
        fs.writeFileSync(
            path.join(buildFolder, constants.CARGO_TOML),
            cargoData[constants.CARGO_TOML],
            {
                encoding: "utf8",
            }
        );

        // If got .lock file, also create it in build folder
        if (cargoData[constants.CARGO_LOCK]) {
            fs.writeFileSync(
                path.join(buildFolder, constants.CARGO_LOCK),
                cargoData[constants.CARGO_LOCK],
                {
                    encoding: "utf8",
                }
            );
        }

        // build .rs file to .wasm bin
        await spawnWasmPack({
            cwd: buildFolder,
            outDir: wasmBuildSource,
            outName: wasmName,
            // TODO: make target relative from webpack compiler
            extraArgs: ["--target", "nodejs", "--no-typescript"],
        });

        // FIXME: additional wait here. Should be moved or deleted
        await new Promise((resolve) => {
            setTimeout(resolve, 100);
        });

        // Add generated .wasm bin to webpack files
        this.emitFile(
            wasmName,
            fs.readFileSync(path.join(wasmBuildSource, wasmName))
        );

        callback(
            null,
            // update generated .js script by wasm to remove bad imports and resolve native rs functions without __wasm ident
            `${fs
                .readFileSync(
                    path.join(
                        wasmBuildSource,
                        `${wasmName.replace(".wasm", "")}.js`
                    ),
                    {
                        encoding: "utf8",
                    }
                )
                .replace("_bg.wasm", "")}
            const usedExportValues = Object.keys(module.exports).filter(item=> item !== "__wasm");
            module.exports = {...Object.keys(wasm).filter(item=> usedExportValues.indexOf(item) === -1).reduce((acc, item)=> ({...acc, [item]: wasm[item]}), {}), ...usedExportValues.reduce((acc, item)=>({...acc, [item]:module.exports[item] }),{})}`
        );
    } catch (e) {
        callback(e, null);
    }
};
