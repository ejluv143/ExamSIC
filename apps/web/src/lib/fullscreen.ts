// Full screen for taking a session. Browsers only grant it inside a click (or tap), so these are called from
// handlers: the Join and Start buttons, and the game's prompt. Where it isn't available (iPhones, iframes) they
// do nothing, and the session carries on in the window.
export const fullscreenAvailable = () => typeof document !== "undefined" && document.fullscreenEnabled;

// Puts `element` (the page by default) in full screen. Resolves to whether it happened.
export async function enterFullscreen(element: HTMLElement | null = null): Promise<boolean> {
  if (!fullscreenAvailable()) return false;
  if (document.fullscreenElement) return true;
  try {
    await (element ?? document.documentElement).requestFullscreen();
    return true;
  } catch {
    return false;
  }
}

export function leaveFullscreen() {
  if (typeof document !== "undefined" && document.fullscreenElement) document.exitFullscreen().catch(() => {});
}
