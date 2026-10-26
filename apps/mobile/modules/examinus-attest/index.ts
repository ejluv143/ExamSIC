// Device integrity for exams (Android: Play Integrity; iOS: App Attest) and the signs of a rooted or emulated phone.
// The web build has neither: `attest` resolves null and there are no hints.
import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";

export type DeviceHint = "rooted_device" | "emulator";

export type DeviceProof = { platform: "android" | "ios"; token: string; keyId?: string };

type Native = {
  integrityToken(nonce: string, project: string): Promise<string>;
  attest(nonce: string): Promise<{ keyId: string; token: string }>;
  deviceHints(): DeviceHint[];
};

const native = Platform.OS === "web" ? null : requireOptionalNativeModule<Native>("ExaminusAttest");

// What looks wrong with this device, from heuristics a determined user can hide; never proof the device is clean.
export function deviceHints(): DeviceHint[] {
  return native?.deviceHints() ?? [];
}

// The platform's proof over the server's nonce. `androidProject` is the Google Cloud project number linked to Play
// Integrity. Rejects when the platform refuses (no Play services, no linked project, App Attest unsupported).
export async function attest(nonce: string, androidProject: string): Promise<DeviceProof | null> {
  if (native === null) return null;
  if (Platform.OS === "android") return { platform: "android", token: await native.integrityToken(nonce, androidProject) };
  const proof = await native.attest(nonce);
  return { platform: "ios", token: proof.token, keyId: proof.keyId };
}
