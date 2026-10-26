// Lint rules for the API, the MCP server, the code runner and the shared packages (issue #44): typescript-eslint's
// recommended set, and ESLint's for the runner's plain JavaScript. Each of them has an eslint.config.mjs that uses this
// one. The web app, the mobile app and the client packages have configs of their own.
import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
  { files: ["**/*.{js,mjs}"], extends: [js.configs.recommended], languageOptions: { globals: globals.node } },
  ...tseslint.configs.recommended,
  {
    rules: {
      // A leading underscore marks a name kept on purpose, mostly a key dropped from an object by destructuring.
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  globalIgnores(["dist/**", "src/database/migrations/**"]),
]);
