import type { ClientPlatform } from "@examinus/taking/platform";
import { getDeviceId } from "@/lib/device";
import { enterFullscreen, fullscreenAvailable, leaveFullscreen } from "@/lib/fullscreen";
import { hasSecondScreen, webSensors } from "./web-sensors";

// The browser as a platform for taking an exam. The desktop app is a browser too (it only adds the lock around it).
export const webPlatform: ClientPlatform = {
  kind: "web",
  version: "0.0.0",
  platform: "browser",
  deviceId: async () => getDeviceId(),
  // A browser has nothing to prove what it is.
  attest: async () => null,
  // Where full screen is required and available, "back" means back in full screen.
  sensors: (settings) => webSensors(settings, { needsFullscreen: settings.requireFullscreen && fullscreenAvailable() }),
  lockdown: {
    enter: async () => {
      await enterFullscreen();
    },
    exit: async () => leaveFullscreen(),
  },
  systemCheck: async () => ({
    items: [
      {
        id: "second-screen",
        label: "Only one screen is connected",
        ok: !hasSecondScreen(),
        fix: "Unplug or turn off the second screen.",
      },
      {
        id: "fullscreen",
        label: "Full screen is available",
        ok: fullscreenAvailable(),
        fix: "Use a browser that can go full screen, outside a frame.",
      },
    ],
  }),
};

// Checks in with the server whenever the tab is shown or hidden (the page's way of waking), for `useAttemptLink`.
export function onPageWake(beat: () => void) {
  document.addEventListener("visibilitychange", beat);
  return () => document.removeEventListener("visibilitychange", beat);
}
