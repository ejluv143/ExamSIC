// The design tokens, as data. apps/web stays CSS-first: `apps/web/src/app/globals.css` is where the web gets its
// colours, and tokens.test.ts fails when the two drift. Native clients read these values (through the Tailwind
// preset or directly). Radii and spacing are Tailwind's defaults on both sides, so there are none here.

// Neutral and status colours, by mode. Keys are the CSS variable names without the leading `--`.
export const modeColors = {
  light: {
    background: "#f6f7f9",
    surface: "#ffffff",
    "surface-muted": "#eff1f5",
    foreground: "#111827",
    muted: "#5b6475",
    border: "#e2e5eb",
    success: "#12805c",
    "success-soft": "#e3f6ee",
    warning: "#a35c00",
    "warning-soft": "#fff1dc",
    danger: "#c4302b",
    "danger-soft": "#fde8e7",
    info: "#1e63c4",
    "info-soft": "#e5effc",
  },
  dark: {
    background: "#0b0d12",
    surface: "#13161d",
    "surface-muted": "#1b1f28",
    foreground: "#e8eaef",
    muted: "#9aa3b2",
    border: "#262b36",
    success: "#4cc79a",
    "success-soft": "#12291f",
    warning: "#f0a53a",
    "warning-soft": "#2e2212",
    danger: "#f2716b",
    "danger-soft": "#331716",
    info: "#6ea8ff",
    "info-soft": "#14233a",
  },
} as const;

export type ThemeMode = keyof typeof modeColors;
export type ModeColor = keyof (typeof modeColors)["light"];

// One accent's shades for one mode; `primary` is the colour itself, the rest are its `--primary-*` siblings.
export type AccentShades = { primary: string; hover: string; soft: string; foreground: string };

export const accents = {
  blue: {
    light: { primary: "#2563eb", hover: "#1d4ed8", soft: "#e7efff", foreground: "#ffffff" },
    dark: { primary: "#6b9cff", hover: "#8ab1ff", soft: "#172443", foreground: "#0b0d12" },
  },
  violet: {
    light: { primary: "#5b3df5", hover: "#4a2ee0", soft: "#eeeaff", foreground: "#ffffff" },
    dark: { primary: "#8b74ff", hover: "#a08cff", soft: "#26204a", foreground: "#0b0d12" },
  },
  emerald: {
    light: { primary: "#047857", hover: "#065f46", soft: "#dff5ec", foreground: "#ffffff" },
    dark: { primary: "#34d399", hover: "#6ee7b7", soft: "#0f2a20", foreground: "#0b0d12" },
  },
  rose: {
    light: { primary: "#e11d48", hover: "#be123c", soft: "#ffe8ed", foreground: "#ffffff" },
    dark: { primary: "#fb7185", hover: "#fda4af", soft: "#3a1520", foreground: "#0b0d12" },
  },
  amber: {
    light: { primary: "#b45309", hover: "#92400e", soft: "#fff1dc", foreground: "#ffffff" },
    dark: { primary: "#fbbf24", hover: "#fcd34d", soft: "#33240c", foreground: "#0b0d12" },
  },
} as const satisfies Record<string, Record<ThemeMode, AccentShades>>;

export type Accent = keyof typeof accents;
export const defaultAccent: Accent = "blue";

// Family names only; the web loads them with next/font, native loads the same families with expo-font.
export const fonts = {
  sans: "Inter",
  display: "Poppins",
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
