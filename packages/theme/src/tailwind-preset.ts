// A Tailwind v3-style preset (what NativeWind reads) built from the tokens. Colours are the same CSS variables the
// web uses, so a light/dark or accent switch only changes the variables (see `colorVars`).
import { fonts, modeColors } from "./tokens.ts";

const variable = (name: string) => `var(--${name})`;

const colors: Record<string, string> = {};
for (const name of Object.keys(modeColors.light)) colors[name] = variable(name);
for (const name of ["primary", "primary-hover", "primary-soft", "primary-foreground"]) colors[name] = variable(name);

export const examinusPreset = {
  theme: {
    extend: {
      colors,
      fontFamily: {
        sans: [fonts.sans],
        display: [fonts.display],
        mono: [fonts.mono],
      },
    },
  },
};

export default examinusPreset;
