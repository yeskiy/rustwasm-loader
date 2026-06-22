/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
    tutorialSidebar: [
        "index",
        {
            type: "category",
            label: "🚀 Getting Started",
            items: [
                "docs/getting-started/overview",
                "docs/getting-started/prerequisites",
                "docs/getting-started/installation",
                "docs/getting-started/quick-start",
            ],
        },
        {
            type: "category",
            label: "🛠️ Examples",
            items: [
                "docs/examples/index",
                "docs/examples/web-webpack",
                "docs/examples/node-webpack",
                "docs/examples/node-bun",
                "docs/examples/esbuild",
                "docs/examples/rspack",
                "docs/examples/rollup",
                "docs/examples/vite",
            ],
        },
        {
            type: "category",
            label: "📚 API Reference",
            items: ["docs/api/index"],
        },
        "changelog",
        "contributing",
    ],
};

module.exports = sidebars;
