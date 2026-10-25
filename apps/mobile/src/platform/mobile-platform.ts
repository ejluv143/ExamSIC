// What the phone can do for an exam (`ClientPlatform`, packages/taking/src/platform.ts), each piece saying plainly what
// it can't do, so nothing reports a check that never ran:
//   - `attest` asks the platform (Play Integrity, App Attest; the `examinus-attest` module) to vouch for the app and
//     the device over the server's nonce; null on web.
//   - `sensors` are the app and screen watchers (`mobile-sensors.ts`).
//   - `lockdown` blocks screen capture and pins the screen (Android Lock Task; iOS Guided Access where the device lets
//     the app start it).
//   - `systemCheck` lists what the exam needs from the device (`system-check.ts`).
import type { ClientPlatform } from "@examinus/taking/platform";
import * as Clipboard from "expo-clipboard";
import * as ScreenCapture from "expo-screen-capture";
import { Platform } from "react-native";
import { appVersion, platformLabel } from "@/lib/client-info";
import { attest, deviceId } from "./device";
import { requestGuidedAccess, startLockTask, stopLockTask } from "../../modules/examinus-integrity";
import { mobileSensors } from "./mobile-sensors";
import { systemCheck } from "./system-check";

const captureKey = "examinus-exam";
const nativeExam = Platform.OS === "android" || Platform.OS === "ios";

// Empties the clipboard, so notes copied before the attempt can't be pasted into it.
export async function clearClipboard(): Promise<void> {
  if (nativeExam) await Clipboard.setStringAsync("");
}

// While the attempt runs: the screen can't be captured (Android: the window is secure, so screenshots and recents are
// black; iOS: the content is protected and the app switcher is blurred), and it is pinned. A pin that fails shows up as
// `kiosk_exited` from the pinned-screen sensor, so a refusal here is not an error of its own.
async function enter(): Promise<void> {
  if (!nativeExam) return;
  await Promise.allSettled([
    ScreenCapture.preventScreenCaptureAsync(captureKey),
    Platform.OS === "ios" ? ScreenCapture.enableAppSwitcherProtectionAsync() : Promise.resolve(),
    Platform.OS === "android" ? startLockTask() : requestGuidedAccess(true),
  ]);
}

async function exit(): Promise<void> {
  if (!nativeExam) return;
  await Promise.allSettled([
    ScreenCapture.allowScreenCaptureAsync(captureKey),
    Platform.OS === "ios" ? ScreenCapture.disableAppSwitcherProtectionAsync() : Promise.resolve(),
    Platform.OS === "android" ? stopLockTask() : requestGuidedAccess(false),
  ]);
}

export const mobilePlatform: ClientPlatform = {
  kind: "mobile",
  version: appVersion,
  platform: platformLabel,
  deviceId,
  attest,
  sensors: mobileSensors,
  lockdown: { enter, exit },
  systemCheck,
};
