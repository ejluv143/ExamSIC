// This package runs in the browser, the desktop app and React Native, so it may not touch what only a browser has.
// Platform code goes behind `ClientPlatform` and is passed in.
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

const browserOnly = ["window", "document", "localStorage", "sessionStorage", "navigator", "location"];

export default defineConfig([
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts"],
    rules: {
      "no-restricted-globals": [
        "error",
        ...browserOnly.map((name) => ({
          name,
          message: `No browser globals in @examinus/taking (${name}): the platform provides it (see ClientPlatform in platform.ts).`,
        })),
      ],
    },
  },
]);
