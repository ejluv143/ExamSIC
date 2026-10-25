// The pre-exam check of the phone (`ClientPlatform.systemCheck`): what the exam needs from the device, each item with
// whether it passes and, when it doesn't, the exact step that fixes it. Every item is required; the exam screen keeps
// Start closed until all pass.
//   - attestation: the cached result of `client.attest` (M4), refreshed when it is about to expire.
//   - pinning: Android's "Screen pinning" switch (or a pin already on), iOS Guided Access.
//   - displays, split screen: from the integrity module's snapshot.
//   - overlay: windows drawn over the app can only be seen when they cover a touch, so this lists the ones seen while
//     the check screen was open (`endSystemCheck` stops watching).
//   - battery and network.
import type { SystemCheckResult } from "@examinus/taking/platform";
import NetInfo from "@react-native-community/netinfo";
import * as Battery from "expo-battery";
import { Platform } from "react-native";
import { deviceProof } from "@/lib/attestation";
import { guidedAccessEnabled, lockTaskState, screenPinningEnabled, snapshot, watch } from "../../modules/examinus-integrity";

const minBattery = 0.2;
// An overlay seen this recently still counts: it may well still be there.
const overlayMemoryMs = 15_000;

export const guidedAccessSteps = "Turn on Guided Access: Settings › Accessibility › Guided Access. Then come back here, triple-click the side or Home button and tap Start.";
const pinningSteps = "Turn on screen pinning: Settings › Security & privacy › More security settings › App pinning (older phones: Settings › Security › Screen pinning). The app pins the screen when you start.";

let overlaySeenAt = 0;
let stopWatching: (() => void) | null = null;

// Stops watching for overlays once the check screen is left.
export function endSystemCheck(): void {
  stopWatching?.();
  stopWatching = null;
  overlaySeenAt = 0;
}

type Item = SystemCheckResult["items"][number];

async function attestationItem(): Promise<Item> {
  const label = "This phone is verified";
  const { attestation, rejected } = await deviceProof();
  if (attestation !== null) return { id: "attestation", label, ok: true, detail: "Verified for exams." };
  return {
    id: "attestation",
    label,
    ok: false,
    fix: rejected ?? "Use the Examinus app from the school's store link on a real phone or tablet that has Google Play (Android) or is signed in to the App Store (iOS), then check again.",
  };
}

function pinningItem(): Item {
  if (Platform.OS === "ios") {
    const on = guidedAccessEnabled() === true;
    return { id: "pinning", label: "Guided Access is on", ok: on, ...(on ? { detail: "Guided Access is on." } : { fix: guidedAccessSteps }) };
  }
  if (Platform.OS === "android") {
    const state = lockTaskState();
    const pinned = state === "pinned" || state === "locked";
    const on = pinned || screenPinningEnabled() === true;
    return {
      id: "pinning",
      label: "Screen pinning is on",
      ok: on,
      ...(on ? { detail: pinned ? "The screen is pinned." : "Switched on; the app pins the screen when you start." } : { fix: pinningSteps }),
    };
  }
  return { id: "pinning", label: "The screen can be pinned", ok: false, fix: "Open the Examinus app on your phone or tablet." };
}

function displayItem(): Item {
  const count = snapshot().displays ?? 1;
  return {
    id: "displays",
    label: "No external display",
    ok: count <= 1,
    ...(count <= 1 ? { detail: "Only this screen is connected." } : { fix: "Unplug the cable, or turn off screen mirroring and casting, to any other screen." }),
  };
}

function splitItem(): Item {
  const { split, pip } = snapshot();
  const open = split === true || pip === true;
  return {
    id: "split",
    label: "Not in split screen",
    ok: !open,
    ...(open ? { fix: split === true ? "Close the other app in split screen, so Examinus fills the screen." : "Close the picture-in-picture window." } : { detail: "Examinus fills the screen." }),
  };
}

function overlayItem(): Item {
  stopWatching ??= watch({ onOverlay: () => {
      overlaySeenAt = Date.now();
    },
  });
  const seen = Date.now() - overlaySeenAt < overlayMemoryMs;
  return {
    id: "overlay",
    label: "Nothing drawn over the screen",
    ok: !seen,
    ...(seen
      ? { fix: "Close floating bubbles, screen filters and anything else drawn over other apps (Settings › Apps › Special access › Display over other apps), then check again." }
      : { detail: "No overlay seen so far. One drawn over the exam later is reported to your teacher." }),
  };
}

async function batteryItem(): Promise<Item> {
  const label = "Battery is 20% or more, or charging";
  const [level, state] = await Promise.all([Battery.getBatteryLevelAsync(), Battery.getBatteryStateAsync()]);
  const charging = state === Battery.BatteryState.CHARGING || state === Battery.BatteryState.FULL;
  if (level < 0) return charging ? { id: "battery", label, ok: true, detail: "Charging." } : { id: "battery", label, ok: false, fix: "The battery level can't be read. Plug in the charger." };
  const percent = Math.round(level * 100);
  const ok = charging || level >= minBattery;
  return { id: "battery", label, ok, ...(ok ? { detail: `${percent}%${charging ? ", charging" : ""}.` } : { fix: `The battery is at ${percent}%. Plug in the charger before you start.` }) };
}

async function networkItem(): Promise<Item> {
  const label = "Internet connection works";
  const net = await NetInfo.fetch();
  const ok = net.isConnected === true && net.isInternetReachable !== false;
  return { id: "network", label, ok, ...(ok ? { detail: "Connected." } : { fix: "Connect to Wi-Fi or mobile data and check again. The timer keeps running even when you are offline." }) };
}

export async function systemCheck(): Promise<SystemCheckResult> {
  const [attestation, battery, network] = await Promise.all([attestationItem(), batteryItem(), networkItem()]);
  return { items: [attestation, pinningItem(), displayItem(), splitItem(), overlayItem(), battery, network] };
}
