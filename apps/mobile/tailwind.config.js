// NativeWind reads the same colour variables the web uses (`@examinus/theme`); the values come from `colorVars` in
// src/ui/theme.tsx. The preset is TypeScript, which Node loads natively.
const examinus = require("@examinus/theme/tailwind-preset");

module.exports = {
  // The colours switch through CSS variables (src/ui/theme.tsx), not `dark:` classes; "class" keeps NativeWind from
  // managing the colour scheme itself, which its web runtime refuses to do with "media".
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset"), examinus.default],
  theme: { extend: {} },
};
