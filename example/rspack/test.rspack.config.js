const common = require("./rspack.config");

common.entry = "./src/index.test.js";
common.output.filename = "comp.test.js";
module.exports = common;
