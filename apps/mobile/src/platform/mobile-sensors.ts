// What watches the phone while an attempt is taken, for the settings the session turns on (`ClientPlatform.sensors`).
//   - trackFocus: the app leaving the screen (`AppState` background or inactive) → `switched_app`, counted once per
//     incident with the time away by the log's away state machine.
//   - trackFocus or requireFullscreen: screenshots, screen recording and casting, split screen and picture in picture,
//     a window drawn over the exam, another display.
//   - requireFullscreen: the pinned screen (Android Lock Task, iOS Guided Access) lifted → `kiosk_exited`.
//   - blockSecondScreen: another display covers the exam until it is gone.
//   - the text inputs follow blockPaste, blockCopy and blockRightClick (`input-guard.ts`).
// Every sensor degrades on the web and where the native module is missing: it watches nothing and reports nothing.
import { integrityNotice } from "@examinus/copy/integrity";
import type { IntegritySettings } from "@examinus/domain/quiz";
import type { IntegrityEmit, IntegritySensor } from "@examinus/taking/integrity";
import { addScreenshotListener } from "expo-screen-capture";
import { AppState, Platform } from "react-native";
import { guidedAccessEnabled, requestGuidedAccess, snapshot, startLockTask, watch } from "../../modules/examinus-integrity";
import { attachInputGuard } from "./input-guard";

// How long the student has to confirm the pin before not being pinned counts as leaving the locked screen.
const pinGraceMs = 15000;
// How soon the pin is asked for again after it was lifted.
const repinMs = 1500;

const native = Platform.OS === "android" || Platform.OS === "ios";

export function mobileSensors(settings: IntegritySettings): IntegritySensor[] {
  if (!native) return [];
  const { trackFocus, requireFullscreen, blockSecondScreen, blockPaste, blockCopy, blockRightClick, allowPasteInCode } = settings;
  const kiosk = pinnedScreen(requireFullscreen);
  const sensors: IntegritySensor[] = [
    {
      // Back means the app is on screen and, where the screen must be pinned, pinned.
      back: () => AppState.currentState === "active" && kiosk.ok(),
      start: () => () => {},
    },
  ];
  if (trackFocus)
    sensors.push({
      start: (emit) => {
        const sub = AppState.addEventListener("change", (state) => {
          if (state !== "active") emit.away("switched_app", integrityNotice.switchedApp);
        });
        return () => sub.remove();
      },
    });
  if (trackFocus || requireFullscreen || blockSecondScreen)
    sensors.push({
      start: (emit) => {
        const now = snapshot();
        // Each is logged when it starts, not on every change the system reports while it lasts.
        let split = false;
        let recording = false;
        let crowded = false;
        const windowMode = (small: boolean) => {
          if (small && !split) emit.record("split_screen", { notice: integrityNotice.splitScreen });
          split = small;
        };
        const capture = (on: boolean) => {
          if (on && !recording) emit.record("screen_recording", { notice: integrityNotice.screenRecording });
          recording = on;
        };
        const screens = (count: number) => {
          const several = count > 1;
          if (several && !crowded) emit.record("external_display", { notice: integrityNotice.externalDisplay });
          crowded = several;
          if (blockSecondScreen) emit.secondScreen(several);
        };
        windowMode(now.split === true || now.pip === true);
        capture(now.recording === true);
        screens(now.displays ?? 1);
        const stopWatching = watch({
          onWindowMode: ({ split: s, pip }) => windowMode(s || pip),
          onOverlay: () => emit.record("overlay_detected", { notice: integrityNotice.overlay }),
          onDisplays: ({ count }) => screens(count),
          onScreenRecording: ({ recording: on }) => capture(on),
        });
        const screenshots = trackFocus || requireFullscreen ? addScreenshotListener(() => emit.record("screenshot", { notice: integrityNotice.screenshot })) : null;
        return () => {
          stopWatching();
          screenshots?.remove();
        };
      },
    });
  if (requireFullscreen) sensors.push({ start: kiosk.start });
  sensors.push({
    start: (emit) => attachInputGuard({ emit, blockPaste, allowPasteInCode, blockCopy, blockRightClick }),
  });
  return sensors;
}

// The pinned screen: Android's Lock Task, iOS's Guided Access. The student has `pinGraceMs` to confirm the pin when the
// attempt starts; once it has been pinned, or the time is up, being unpinned counts as leaving, and the pin is asked for
// again.
function pinnedScreen(required: boolean) {
  let pinned = false;
  let given = true;
  const isPinned = () => (Platform.OS === "android" ? snapshot().lockTask !== "none" : guidedAccessEnabled() === true);
  return {
    // True while nothing is wrong: not required, still inside the grace time, or pinned.
    ok: () => !required || given || pinned,
    start: (emit: IntegrityEmit) => {
      pinned = isPinned();
      given = !pinned;
      const timers = new Set<ReturnType<typeof setTimeout>>();
      const later = (fn: () => void, ms: number) => {
        const timer = setTimeout(() => {
          timers.delete(timer);
          fn();
        }, ms);
        timers.add(timer);
      };
      const ask = () => (Platform.OS === "android" ? startLockTask() : requestGuidedAccess(true).then(() => undefined)).catch(() => undefined);
      const lifted = (message: string) => {
        pinned = false;
        given = false;
        emit.away("kiosk_exited", message);
        later(() => void ask(), repinMs);
      };
      const changed = (on: boolean) => {
        if (on) {
          pinned = true;
          given = false;
        } else if (pinned) lifted(integrityNotice.kioskExited);
      };
      const stop = watch({
        onLockTask: ({ state }) => changed(state !== "none"),
        onGuidedAccess: ({ enabled }) => changed(enabled),
      });
      if (!pinned) {
        later(() => {
          if (!pinned) lifted(integrityNotice.kioskMissing);
        }, pinGraceMs);
      }
      return () => {
        stop();
        timers.forEach(clearTimeout);
      };
    },
  };
}
