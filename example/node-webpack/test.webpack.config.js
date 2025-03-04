const common = require("./webpack.config");

common.entry = ["regenerator-runtime/runtime", "./src/index.test.js"];
common.output.filename = "comp.test.js";
module.exports = common;
