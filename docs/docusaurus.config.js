const { themes } = require("prism-react-renderer");

const lightCodeTheme = themes.github;
const darkCodeTheme = themes.dracula;

/** @type {import("@docusaurus/types").Config} */
const config = {
    title: "rust-wasmpack-loader",
    tagline: "Native wasm Webpack/Bun loader for .rs (Rust) resources",

    url: "https://yeskiy.github.io",

    baseUrl: "/rustwasm-loader/",

    organizationName: "yeskiy",
    projectName: "rustwasm-loader",

    onBrokenLinks: "warn",
    onBrokenMarkdownLinks: "warn",

    i18n: {
        defaultLocale: "en",
        locales: ["en"],
    },

    presets: [
        [
            "classic",
            /** @type {import("@docusaurus/preset-classic").Options} */
            ({
                docs: {
                    sidebarPath: require.resolve("./sidebars.js"),
                    routeBasePath: "/",
                    editUrl:
                        "https://github.com/yeskiy/rustwasm-loader/tree/main/",
                },
                blog: false,
                theme: {
                    customCss: require.resolve("./custom.css"),
                },
            }),
        ],
    ],

    markdown: {
        mermaid: true,
    },
    themes: ["@docusaurus/theme-mermaid"],

    themeConfig:
        /** @type {import("@docusaurus/preset-classic").ThemeConfig} */
        ({
            navbar: {
                title: "rust-wasmpack-loader",
                items: [
                    {
                        type: "docSidebar",
                        sidebarId: "tutorialSidebar",
                        position: "left",
                        label: "Docs",
                    },
                    {
                        to: "/docs/examples",
                        label: "Examples",
                        position: "left",
                    },
                    {
                        to: "/docs/api",
                        label: "API",
                        position: "left",
                    },
                    {
                        href: "https://github.com/yeskiy/rustwasm-loader",
                        label: "GitHub",
                        position: "right",
                    },
                    {
                        href: "https://www.npmjs.com/package/rust-wasmpack-loader",
                        label: "NPM",
                        position: "right",
                    },
                ],
            },
            footer: {
                style: "dark",
                links: [
                    {
                        title: "Docs",
                        items: [
                            {
                                label: "Getting Started",
                                to: "/docs/getting-started",
                            },
                            {
                                label: "API Reference",
                                to: "docs/api",
                            },
                        ],
                    },
                    {
                        title: "Examples",
                        items: [
                            {
                                label: "Web Application",
                                to: "/docs/examples/web-webpack",
                            },
                            {
                                label: "Node.js Application",
                                to: "/docs/examples/node-webpack",
                            },
                            {
                                label: "Bun Application",
                                to: "/docs/examples/node-bun",
                            },
                        ],
                    },
                    {
                        title: "More",
                        items: [
                            {
                                label: "GitHub",
                                href: "https://github.com/yeskiy/rustwasm-loader",
                            },
                            {
                                label: "NPM",
                                href: "https://www.npmjs.com/package/rust-wasmpack-loader",
                            },
                            {
                                label: "Issues",
                                href: "https://github.com/yeskiy/rustwasm-loader/issues",
                            },
                        ],
                    },
                ],
                copyright: `Copyright © ${new Date().getFullYear()} Yehor Brodskiy. Built with ❤️ in 🇺🇦`,
            },
            prism: {
                theme: lightCodeTheme,
                darkTheme: darkCodeTheme,
                additionalLanguages: [
                    "rust",
                    "toml",
                    "bash",
                    "javascript",
                    "typescript",
                ],
            },
        }),
};

module.exports = config;
