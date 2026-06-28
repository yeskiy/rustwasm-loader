import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import { configs, plugins } from "eslint-config-airbnb-extended";
import { rules as prettierConfigRules } from "eslint-config-prettier";
import prettierPlugin from "eslint-plugin-prettier";
import globals from "globals";

export default defineConfig([
    globalIgnores([
        "**/node_modules/**",
        "**/dist/**",
        "**/dist-ssr/**",
        "**/dist-client/**",
        "**/pkg/**",
        "**/build/**",
        "**/target/**",
        "**/.next/**",
        "**/out/**",
        ".docusaurus/**",
        "**/*.d.rs.ts",
    ]),

    { name: "js/config", ...js.configs.recommended },

    // --- Airbnb base (JS rules + import-x + stylistic), no React ---
    plugins.stylistic,
    plugins.importX,
    ...configs.base.recommended,
    plugins.node,
    ...configs.node.recommended,
    plugins.typescriptEslint,
    ...configs.base.typescript,

    // --- Project language options ---
    {
        name: "project/language-options",
        languageOptions: {
            globals: {
                ...globals.node,
                ...globals.commonjs,
                Atomics: "readonly",
                SharedArrayBuffer: "readonly",
                logger: "readonly",
            },
        },
    },
    {
        name: "project/commonjs-sources",
        files: [
            "src/**/*.js",
            "bin/**/*.js",
            "tsserver.js",
            "*.cjs",
            "docs/**/*.js",
            "example/**/*.config.js",
        ],
        languageOptions: {
            sourceType: "commonjs",
        },
    },

    // --- Prettier (must come last to disable conflicting formatting rules) ---
    {
        name: "prettier/plugin",
        plugins: { prettier: prettierPlugin },
    },
    {
        name: "prettier/config",
        rules: {
            ...prettierConfigRules,
            "prettier/prettier": ["warn", { endOfLine: "auto" }],
        },
    },

    // --- Project rule overrides (kept relaxed so src/ stays clean) ---
    {
        name: "project/rules",
        rules: {
            "no-console": "off",
            eqeqeq: "warn",
            "no-underscore-dangle": "off",
            curly: "off",
            "no-async-promise-executor": "off",
            "no-await-in-loop": "off",
            "no-restricted-syntax": "off",
            "no-plusplus": "off",
            camelcase: "warn",
            "no-constructor-return": "off",
            "no-return-assign": "off",
            "max-classes-per-file": "off",
            "n/no-sync": "off",
            "n/no-process-exit": "off",
            "n/prefer-node-protocol": "off",
            "n/global-require": "off",
        },
    },

    // --- Example test files (Bun/Jest runtime globals, virtual modules) ---
    {
        name: "project/example-tests",
        files: ["example/**/*.test.js"],
        languageOptions: {
            globals: {
                ...globals.jest,
                Bun: "readonly",
            },
        },
        rules: {
            "import-x/no-unresolved": "off",
            "import-x/no-extraneous-dependencies": "off",
        },
    },

    // --- Example node:test suites (.mjs; load the built bundle dynamically) ---
    {
        name: "project/example-node-tests",
        files: ["example/**/*.test.mjs"],
        rules: {
            "import-x/no-unresolved": "off",
            "import-x/no-extraneous-dependencies": "off",
            "import-x/no-dynamic-require": "off",
        },
    },

    // --- Docs config (Docusaurus tooling lives in devDependencies) ---
    {
        name: "project/docs",
        files: ["docs/**/*.js"],
        rules: {
            "import-x/no-extraneous-dependencies": "off",
        },
    },

    // --- Example build scripts and configs (resolve deps only after the example is installed) ---
    {
        name: "project/example-build-scripts",
        files: ["example/**/build.mjs", "example/**/*.config.{js,mjs}"],
        rules: {
            "import-x/no-unresolved": "off",
            "import-x/no-extraneous-dependencies": "off",
        },
    },

    // --- Electron example app sources (renderer runs in a browser; main pulls in the electron dev dep) ---
    {
        name: "project/example-electron-app",
        files: [
            "example/electron/src/main.js",
            "example/electron/src/renderer.js",
        ],
        languageOptions: {
            globals: {
                ...globals.browser,
            },
        },
        rules: {
            "import-x/no-unresolved": "off",
            "import-x/no-extraneous-dependencies": "off",
        },
    },
]);
