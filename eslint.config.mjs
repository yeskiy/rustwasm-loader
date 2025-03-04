/* eslint-disable import/no-extraneous-dependencies,import/no-unresolved */
import prettier from "eslint-plugin-prettier";
import stylistic from "@stylistic/eslint-plugin";
import globals from "globals";
import tsParser from "@typescript-eslint/parser";
import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({
    baseDirectory: path.dirname(fileURLToPath(import.meta.url)),
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all,
});

export default [
    ...compat.extends(
        "prettier",
        "airbnb-base",
        "@kesills/eslint-config-airbnb-typescript/base",
    ),
    {
        plugins: {
            prettier,
            "@stylistic": stylistic,
        },

        languageOptions: {
            globals: {
                ...globals.node,
                ...globals.commonjs,
                Atomics: "readonly",
                SharedArrayBuffer: "readonly",
                logger: "readonly",
            },

            parser: tsParser,
            ecmaVersion: 2023,
            sourceType: "commonjs",

            parserOptions: {
                project: ["./tsconfig.json"],
            },
        },

        rules: {
            "prettier/prettier": [
                "warn",
                {
                    endOfLine: "auto",
                },
            ],

            "operator-linebreak": "off",
            "linebreak-style": "off",
            "@stylistic/semi": ["error", "always"],
            indent: "off",
            "@stylistic/indent": "off",
            "@stylistic/comma-dangle": "off",
            "no-console": "off",
            "@stylistic/no-unused-expressions": "off",
            "@stylistic/quotes": "off",
            eqeqeq: "warn",
            "wrap-iife": "off",
            "no-underscore-dangle": "off",
            "implicit-arrow-linebreak": "off",
            "function-paren-newline": "off",
            "nonblock-statement-body-position": "off",
            curly: "off",
            "object-curly-newline": "off",
            "@stylistic/object-curly-spacing": "off",
            "no-async-promise-executor": "off",
            "max-len": "off",
            "no-await-in-loop": "off",
            "no-restricted-syntax": "off",
            "no-plusplus": "off",
            camelcase: "warn",
            "no-confusing-arrow": "off",
            "no-constructor-return": "off",
            "no-return-assign": "off",
            "max-classes-per-file": "off",
        },
    },
];
