// Appearance preferences, kept per browser in localStorage and applied as attributes on <html>:
//   data-theme="light" | "dark"  the resolved mode (globals.css switches the colour tokens on it);
//   data-accent="<accent>"       the accent colour, missing for the default;
//   data-sidebar="collapsed"     the desktop sidebar shows icons only.
// `themeBootScript` sets them before the first paint, so pages never flash the wrong colours.

export const themeModes = ["light", "dark", "system"] as const;
export type ThemeMode = (typeof themeModes)[number];

export const accents = ["blue", "violet", "emerald", "rose", "amber"] as const;
export type Accent = (typeof accents)[number];
export const defaultAccent: Accent = "blue";

export const accentLabels: Record<Accent, string> = {
  blue: "Blue",
  violet: "Violet",
  emerald: "Emerald",
  rose: "Rose",
  amber: "Amber",
};

export const storageKeys = {
  theme: "examora.theme",
  accent: "examora.accent",
  sidebar: "examora.sidebar",
} as const;

// Runs inline in <head>: applies the saved choices, and follows the system while the mode is "system".
export const themeBootScript = `(() => {
  try {
    const d = document.documentElement;
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const mode = localStorage.getItem("${storageKeys.theme}") || "system";
      d.dataset.theme = mode === "system" ? (media.matches ? "dark" : "light") : mode;
    };
    apply();
    media.addEventListener("change", apply);
    const accent = localStorage.getItem("${storageKeys.accent}");
    if (accent && accent !== "${defaultAccent}") d.dataset.accent = accent;
    if (localStorage.getItem("${storageKeys.sidebar}") === "collapsed") d.dataset.sidebar = "collapsed";
  } catch {}
})();`;

const prefersDark = () => matchMedia("(prefers-color-scheme: dark)").matches;

export function readThemeMode(): ThemeMode {
  const saved = localStorage.getItem(storageKeys.theme);
  return themeModes.includes(saved as ThemeMode) ? (saved as ThemeMode) : "system";
}

export function readAccent(): Accent {
  const saved = localStorage.getItem(storageKeys.accent);
  return accents.includes(saved as Accent) ? (saved as Accent) : defaultAccent;
}

export function setThemeMode(mode: ThemeMode) {
  localStorage.setItem(storageKeys.theme, mode);
  document.documentElement.dataset.theme = mode === "system" ? (prefersDark() ? "dark" : "light") : mode;
}

export function setAccent(accent: Accent) {
  localStorage.setItem(storageKeys.accent, accent);
  if (accent === defaultAccent) delete document.documentElement.dataset.accent;
  else document.documentElement.dataset.accent = accent;
}

export function isSidebarCollapsed(): boolean {
  return document.documentElement.dataset.sidebar === "collapsed";
}

export function setSidebarCollapsed(collapsed: boolean) {
  localStorage.setItem(storageKeys.sidebar, collapsed ? "collapsed" : "expanded");
  if (collapsed) document.documentElement.dataset.sidebar = "collapsed";
  else delete document.documentElement.dataset.sidebar;
}
