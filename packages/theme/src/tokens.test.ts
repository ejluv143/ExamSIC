// Fails when apps/web's globals.css and tokens.ts disagree, so the two can't drift.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { accents, colorVars, modeColors, type Accent, type ThemeMode } from "./tokens.ts";
import { examinusPreset } from "./tailwind-preset.ts";

const css = readFileSync(new URL("../../../apps/web/src/app/globals.css", import.meta.url), "utf8");

// `selector { --x: value; ... }` blocks at the top level, as a map of selector → variables.
function blocks(source: string): Map<string, Map<string, string>> {
  const found = new Map<string, Map<string, string>>();
  for (const [, selector, body] of source.matchAll(/^([:\w\[\]="-]+)\s*\{([^}]*)\}/gm)) {
    const vars = found.get(selector!) ?? new Map<string, string>();
    for (const [, name, value] of body!.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) vars.set(name!, value!.trim());
    found.set(selector!, vars);
  }
  return found;
}

const sheet = blocks(css);
const lookup = (selector: string) => {
  const vars = sheet.get(selector);
  if (!vars) throw new Error(`globals.css has no ${selector} block`);
  return vars;
};

test("mode colours match globals.css", () => {
  const selectors: Record<ThemeMode, string> = { light: ":root", dark: '[data-theme="dark"]' };
  for (const mode of Object.keys(selectors) as ThemeMode[]) {
    const vars = lookup(selectors[mode]);
    for (const [name, value] of Object.entries(modeColors[mode])) expect(vars.get(`--${name}`), `${mode} --${name}`).toBe(value);
  }
});

test("every light colour variable in globals.css is a token", () => {
  const tokens = new Set(Object.keys(modeColors.light).map((n) => `--${n}`));
  const fromCss = [...lookup(":root").keys()].filter((n) => !n.startsWith("--a-") && !n.startsWith("--primary"));
  expect(fromCss.sort()).toEqual([...tokens].sort());
});

test("accent shades match globals.css", () => {
  const selectorOf = (accent: Accent) => (accent === "blue" ? ":root" : `[data-accent="${accent}"]`);
  for (const accent of Object.keys(accents) as Accent[]) {
    const vars = lookup(selectorOf(accent));
    for (const mode of ["light", "dark"] as const) {
      const suffix = mode === "dark" ? "-dark" : "";
      const shades = accents[accent][mode];
      expect(vars.get(`--a-primary${suffix}`), `${accent} ${mode} primary`).toBe(shades.primary);
      expect(vars.get(`--a-primary-hover${suffix}`), `${accent} ${mode} hover`).toBe(shades.hover);
      expect(vars.get(`--a-primary-soft${suffix}`), `${accent} ${mode} soft`).toBe(shades.soft);
      expect(vars.get(`--a-primary-foreground${suffix}`), `${accent} ${mode} foreground`).toBe(shades.foreground);
    }
  }
  const accentBlocks = [...sheet.keys()].filter((s) => s.startsWith("[data-accent="));
  expect(accentBlocks.length).toBe(Object.keys(accents).length - 1);
});

test("colorVars resolves the primary through the accent and mode", () => {
  expect(colorVars("dark", "violet")["--primary"]).toBe(accents.violet.dark.primary);
  expect(colorVars("light")["--background"]).toBe(modeColors.light.background);
});

test("the preset maps every colour to its variable", () => {
  expect(examinusPreset.theme.extend.colors["surface-muted"]).toBe("var(--surface-muted)");
  expect(examinusPreset.theme.extend.colors["primary-soft"]).toBe("var(--primary-soft)");
});
