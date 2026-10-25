// What the phone can do for an exam (`ClientPlatform`, packages/taking/src/platform.ts). Only the device id is real in
// M1. The rest says plainly what it can't do yet, so nothing reports a check that never ran:
//   - `attest` asks the platform (Play Integrity, App Attest; the `examinus-attest` module) to vouch for the app and
//     the device over the server's nonce; null on web.
//   - `sensors` are the app and screen watchers (`mobile-sensors.ts`).
//   - `lockdown` blocks screen capture and pins the screen (Android Lock Task; iOS Guided Access where the device lets
//     the app start it).
//   - `systemCheck` lists no items; the device checks arrive with M5.
import type { ClientPlatform } from "@examinus/taking/platform";
import * as Application from "expo-application";
import * as Clipboard from "expo-clipboard";
import Constants from "expo-constants";
import * as Crypto from "expo-crypto";
import * as ScreenCapture from "expo-screen-capture";
import { Platform } from "react-native";
import { appVersion, platformLabel } from "@/lib/client-info";
import { storage } from "@/lib/storage";
import { attest } from "../../modules/examinus-attest";
import { requestGuidedAccess, startLockTask, stopLockTask } from "../../modules/examinus-integrity";
import { mobileSensors } from "./mobile-sensors";

const deviceKey = "examinus_device_id";

// A random id kept in the secure store: for the web build and for an iPhone that won't give its vendor id.
async function storedDeviceId(): Promise<string> {
  const existing = await storage.get(deviceKey);
  if (existing) return existing;
  const created = Crypto.randomUUID();
  await storage.set(deviceKey, created);
  return created;
}

// The id that ties an attempt to this device and survives clearing the app's data: the Android ID, or the iOS vendor id.
async function deviceId(): Promise<string> {
  if (Platform.OS === "android") return Application.getAndroidId();
  if (Platform.OS === "ios") return (await Application.getIosIdForVendorAsync()) ?? (await storedDeviceId());
  return storedDeviceId();
}

// The Google Cloud project number linked to Play Integrity, from the app config's `extra` (EXPO_PUBLIC_PLAY_INTEGRITY_PROJECT).
const playProject = String((Constants.expoConfig?.extra as { playIntegrityProject?: string } | undefined)?.playIntegrityProject ?? "");

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
  attest: (nonce) => attest(nonce, playProject),
  sensors: mobileSensors,
  lockdown: { enter, exit },
  systemCheck: async () => ({ items: [] }),
};
