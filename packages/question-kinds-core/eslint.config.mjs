// This package runs in the browser and in React Native: no browser-only globals.
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

const browserGlobals = ["window", "document", "localStorage", "sessionStorage", "navigator", "location"];

export default defineConfig([
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts"],
    rules: {
      "no-restricted-globals": [
        "error",
        ...browserGlobals.map((name) => ({
          name,
          message: `${name} is a browser global; this package also runs in React Native. Take it as an argument instead.`,
        })),
      ],
    },
  },
]);
