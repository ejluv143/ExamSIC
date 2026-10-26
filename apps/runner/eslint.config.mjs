// The shared rules for the API, the MCP server, the runner and the shared packages (eslint.base.mjs at the repo root).
import { defineConfig } from "eslint/config";
import base from "../../eslint.base.mjs";

export default defineConfig([
  ...base,
  // The sandbox's JavaScript prelude is a CommonJS script that Node runs before the student's program.
  { files: ["sandbox/**/*.js"], languageOptions: { sourceType: "commonjs" }, rules: { "@typescript-eslint/no-require-imports": "off" } },
]);
