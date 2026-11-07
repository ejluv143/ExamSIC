// The design tokens, as data. apps/web stays CSS-first: `apps/web/src/app/globals.css` is where the web gets its
// colours, and tokens.test.ts fails when the two drift. Native clients read these values (through the Tailwind
// preset or directly). Radii and spacing are Tailwind's defaults on both sides, so there are none here.

// Neutral and status colours, by mode. Keys are the CSS variable names without the leading `--`.
export const modeColors = {
  light: {
    background: "#f4f2fb",
    surface: "#ffffff",
    "surface-muted": "#eeebf7",
    foreground: "#1d1a39",
    muted: "#55537a",
    border: "#e4e0f0",
    success: "#15803d",
    "success-soft": "#dcfce7",
    warning: "#a35c00",
    "warning-soft": "#fff1d6",
    danger: "#dc2626",
    "danger-soft": "#fee4e2",
    info: "#2563eb",
    "info-soft": "#e0e9ff",
  },
  dark: {
    background: "#110f24",
    surface: "#1c1936",
    "surface-muted": "#25223f",
    foreground: "#f3f1ff",
    muted: "#b4b0d6",
    border: "#312d52",
    success: "#4ade80",
    "success-soft": "#0f2a1c",
    warning: "#fbbf24",
    "warning-soft": "#33260a",
    danger: "#f87171",
    "danger-soft": "#3a1518",
    info: "#7aa7ff",
    "info-soft": "#172446",
  },
} as const;

export type ThemeMode = keyof typeof modeColors;
export type ModeColor = keyof (typeof modeColors)["light"];

// One accent's shades for one mode; `primary` is the colour itself, the rest are its `--primary-*` siblings.
export type AccentShades = { primary: string; hover: string; soft: string; foreground: string };

export const accents = {
  blue: {
    light: { primary: "#2563eb", hover: "#1d4ed8", soft: "#e0e9ff", foreground: "#ffffff" },
    dark: { primary: "#7aa7ff", hover: "#9bbdff", soft: "#1b2650", foreground: "#0b1030" },
  },
  violet: {
    light: { primary: "#7c3aed", hover: "#6d28d9", soft: "#ede5ff", foreground: "#ffffff" },
    dark: { primary: "#b197fc", hover: "#c4b0fd", soft: "#2a1f52", foreground: "#170b36" },
  },
  emerald: {
    light: { primary: "#047857", hover: "#065f46", soft: "#d7f5e8", foreground: "#ffffff" },
    dark: { primary: "#34d399", hover: "#6ee7b7", soft: "#0f2e24", foreground: "#03261b" },
  },
  rose: {
    light: { primary: "#e11d48", hover: "#be123c", soft: "#ffe4ea", foreground: "#ffffff" },
    dark: { primary: "#fb7185", hover: "#fda4af", soft: "#3d1524", foreground: "#2b0611" },
  },
  amber: {
    light: { primary: "#b45309", hover: "#92400e", soft: "#fff1d6", foreground: "#ffffff" },
    dark: { primary: "#fbbf24", hover: "#fcd34d", soft: "#36270a", foreground: "#2a1a00" },
  },
} as const satisfies Record<string, Record<ThemeMode, AccentShades>>;

export type Accent = keyof typeof accents;
export const defaultAccent: Accent = "blue";

// Family names only; the web loads them with next/font, native loads the same families with expo-font.
export const fonts = {
  sans: "Nunito",
  display: "Baloo 2",
  mono: "Geist Mono",
} as const;

// Durations (seconds) of the animations in globals.css `@theme`; `ease` is the timing function where it is not the
// default.
export const motion = {
  float: { duration: 6, ease: "ease-in-out" },
  popIn: { duration: 0.45, ease: "cubic-bezier(0.34, 1.56, 0.64, 1)" },
  rise: { duration: 0.45, ease: "ease-out" },
  shake: { duration: 0.5, ease: "ease-in-out" },
  bob: { duration: 2.4, ease: "ease-in-out" },
  growX: { duration: 0.8, ease: "cubic-bezier(0.22, 1, 0.36, 1)" },
  growY: { duration: 0.7, ease: "cubic-bezier(0.34, 1.3, 0.64, 1)" },
  drop: { duration: 0.6, ease: "cubic-bezier(0.34, 1.56, 0.64, 1)" },
  flicker: { duration: 0.6, ease: "ease-in-out" },
  tick: { duration: 1, ease: "ease-out" },
  confetti: { duration: 2.4, ease: "ease-in" },
  ember: { duration: 1.8, ease: "ease-out" },
  glow: { duration: 0.9, ease: "ease-in-out" },
  step: { duration: 0.32, ease: "cubic-bezier(0.22, 1, 0.36, 1)" },
} as const;

// The colour variables of a mode and accent, keyed like globals.css (`--background`, `--primary`, ...). Native
// clients hand this to NativeWind's `vars()`.
export function colorVars(mode: ThemeMode, accent: Accent = defaultAccent): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [name, value] of Object.entries(modeColors[mode])) vars[`--${name}`] = value;
  const shades = accents[accent][mode];
  vars["--primary"] = shades.primary;
  vars["--primary-hover"] = shades.hover;
  vars["--primary-soft"] = shades.soft;
  vars["--primary-foreground"] = shades.foreground;
  return vars;
}
