// What identifies and vouches for this phone, kept apart from `mobile-platform.ts` so the attestation cache
// (`lib/attestation.ts`) and the system check can use it without importing the platform that uses them.
import * as Application from "expo-application";
import Constants from "expo-constants";
import * as Crypto from "expo-crypto";
import { Platform } from "react-native";
import { storage } from "@/lib/storage";
import { attest as platformAttest } from "../../modules/examinus-attest";

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
export async function deviceId(): Promise<string> {
  if (Platform.OS === "android") return Application.getAndroidId();
  if (Platform.OS === "ios") return (await Application.getIosIdForVendorAsync()) ?? (await storedDeviceId());
  return storedDeviceId();
}

// The Google Cloud project number linked to Play Integrity, from the app config's `extra` (EXPO_PUBLIC_PLAY_INTEGRITY_PROJECT).
const playProject = String((Constants.expoConfig?.extra as { playIntegrityProject?: string } | undefined)?.playIntegrityProject ?? "");

export const attest = (nonce: string) => platformAttest(nonce, playProject);
