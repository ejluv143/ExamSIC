// The desktop app (apps/desktop) loads this web app in its own window and announces itself twice: in the user agent
// (`ExaminusDesktop/<version>`, which the API reads from the forwarded headers) and as a frozen global the shell sets
// before any page code runs, for the browser-side UI. Browser only.
export type DesktopBridge = { readonly version: string; readonly platform: string };

declare global {
  interface Window {
    readonly __EXAMINUS_DESKTOP__?: DesktopBridge;
  }
}

// The shell's version and operating system, or null in a browser.
export function desktopBridge(): DesktopBridge | null {
  const bridge = typeof window === "undefined" ? undefined : window.__EXAMINUS_DESKTOP__;
  return bridge && typeof bridge.version === "string" && typeof bridge.platform === "string" ? bridge : null;
}
