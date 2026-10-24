import type { ClientKind } from "@examinus/domain/client";
import type { IntegritySettings } from "@examinus/domain/quiz";
import type { IntegritySensor } from "./integrity.ts";

// One line of the pre-exam device check ("Second screen", "Full screen") and whether it passes.
export type SystemCheckResult = { items: { id: string; label: string; ok: boolean; fix?: string }[] };

// What the app taking an exam can do on its device. The browser, the desktop app and the phone each implement it.
export type ClientPlatform = {
  kind: ClientKind;
  version: string;
  // The system it runs on: "browser", "windows", "android 15", "ios 18".
  platform: string;
  // The token that ties an attempt to this device.
  deviceId(): Promise<string>;
  // The platform's integrity proof for this attempt (Play Integrity, App Attest); null where there is none.
  attest(nonce: string): Promise<{ platform: "android" | "ios" | "desktop"; token: string; keyId?: string } | null>;
  // What watches the student while the exam is taken, for the settings this session turns on.
  sensors(settings: IntegritySettings): IntegritySensor[];
  // Keeps the student in the exam (full screen in a browser, a pinned screen on a phone).
  lockdown: { enter(): Promise<void>; exit(): Promise<void> };
  systemCheck(): Promise<SystemCheckResult>;
};
