// The rules of eslint-config-next (core-web-vitals + typescript), set up here because that package parses
// JavaScript with the Babel build inside `next`, which vinext replaces.
import nextPlugin from "@next/eslint-plugin-next";
import { defineConfig, globalIgnores } from "eslint/config";
import importPlugin from "eslint-plugin-import";
import jsxA11y from "eslint-plugin-jsx-a11y";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

const eslintConfig = defineConfig([
  {
    files: ["**/*.{js,jsx,mjs,ts,tsx,mts,cts}"],
    plugins: {
      react,
      "react-hooks": reactHooks,
      import: importPlugin,
      "jsx-a11y": jsxA11y,
      "@next/next": nextPlugin,
    },
    languageOptions: {
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node },
    },
    settings: {
      react: { version: "detect" },
      "import/parsers": { "@typescript-eslint/parser": [".ts", ".mts", ".cts", ".tsx", ".d.ts"] },
      "import/resolver": { node: { extensions: [".js", ".jsx", ".ts", ".tsx"] }, typescript: { alwaysTryTypes: true } },
    },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
      "import/no-anonymous-default-export": "warn",
      "react/no-unknown-property": "off",
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
      "jsx-a11y/alt-text": ["warn", { elements: ["img"], img: ["Image"] }],
      "jsx-a11y/aria-props": "warn",
      "jsx-a11y/aria-proptypes": "warn",
      "jsx-a11y/aria-unsupported-elements": "warn",
      "jsx-a11y/role-has-required-aria-props": "warn",
      "jsx-a11y/role-supports-aria-props": "warn",
      "react/jsx-no-target-blank": "off",
    },
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/no-unused-expressions": "warn",
    },
  },
  globalIgnores([
    ".next/**",
    "dist/**",
    ".vinext/**",
    // Nitro's build output (`npm run build`), and Vercel's.
    ".output/**",
    ".vercel/**",
    "next-env.d.ts",
    // Runtimes copied from node_modules (gitignored).
    "public/pyodide/**",
    "public/sqljs/**",
  ]),
]);

export default eslintConfig;
