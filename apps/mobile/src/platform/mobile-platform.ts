// What the phone can do for an exam (`ClientPlatform`, packages/taking/src/platform.ts). Only the device id is real in
// M1. The rest says plainly what it can't do yet, so nothing reports a check that never ran:
//   - `attest` returns null, "no integrity proof"; the Play Integrity and App Attest proofs arrive with M4.
//   - `sensors` returns none; the app and screen watchers arrive with M3.
//   - `lockdown` does nothing; the pinned screen arrives with M3 and M5. M1 has no screen that enters it.
//   - `systemCheck` lists no items; the device checks arrive with M5.
import type { ClientPlatform } from "@examinus/taking/platform";
import * as Application from "expo-application";
import * as Crypto from "expo-crypto";
import { Platform } from "react-native";
import { appVersion, platformLabel } from "@/lib/client-info";
import { storage } from "@/lib/storage";

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

export const mobilePlatform: ClientPlatform = {
  kind: "mobile",
  version: appVersion,
  platform: platformLabel,
  deviceId,
  attest: async () => null,
  sensors: () => [],
  lockdown: { enter: async () => undefined, exit: async () => undefined },
  systemCheck: async () => ({ items: [] }),
};
