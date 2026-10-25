// What the exam screen can see about itself, from the native side (Kotlin on Android, Swift on iOS). Every call is a
// no-op on the web and when the native module isn't in the build (Expo Go): `snapshot()` is empty then, so nothing
// reports a check that never ran.
import { requireOptionalNativeModule, type EventSubscription, type NativeModule } from "expo";
import { Platform } from "react-native";

export type LockTaskState = "none" | "pinned" | "locked";

// What is true right now. A field is missing where the platform can't tell.
export type IntegritySnapshot = {
  // Android: the pinned screen.
  lockTask?: LockTaskState;
  // Android: split screen, and picture in picture.
  split?: boolean;
  pip?: boolean;
  // iOS: Guided Access.
  guidedAccess?: boolean;
  // The screen is being recorded, cast or mirrored.
  recording?: boolean;
  // How many displays are connected, the phone's own included.
  displays?: number;
};

type Events = {
  onLockTask(event: { state: LockTaskState }): void;
  onWindowMode(event: { split: boolean; pip: boolean }): void;
  onOverlay(event: { at: number }): void;
  onDisplays(event: { count: number }): void;
  onScreenRecording(event: { recording: boolean }): void;
  onGuidedAccess(event: { enabled: boolean }): void;
};

declare class ExaminusIntegrityNative extends NativeModule<Events> {
  snapshot(): IntegritySnapshot;
  lockTaskState(): LockTaskState;
  screenPinningEnabled(): boolean;
  guidedAccess(): boolean;
  startLockTask(): Promise<void>;
  stopLockTask(): Promise<void>;
  requestGuidedAccess(enabled: boolean): Promise<boolean>;
  startWatching(): Promise<void>;
  stopWatching(): Promise<void>;
}

const native = Platform.OS === "web" ? null : requireOptionalNativeModule<ExaminusIntegrityNative>("ExaminusIntegrity");

export const integrityAvailable = native !== null;

export function snapshot(): IntegritySnapshot {
  return native?.snapshot() ?? {};
}

// Android: pins the screen. Rejects when there is no activity to pin.
export async function startLockTask(): Promise<void> {
  if (Platform.OS === "android") await native?.startLockTask();
}

export async function stopLockTask(): Promise<void> {
  if (Platform.OS === "android") await native?.stopLockTask();
}

export function lockTaskState(): LockTaskState | null {
  return Platform.OS === "android" && native ? native.lockTaskState() : null;
}

// Android: whether "Screen pinning" is switched on in Settings (the pin only works with it, or on a school-managed
// phone); null elsewhere.
export function screenPinningEnabled(): boolean | null {
  return Platform.OS === "android" && native ? native.screenPinningEnabled() : null;
}

// iOS: whether Guided Access is on now; null where there is none (Android, web).
export function guidedAccessEnabled(): boolean | null {
  return Platform.OS === "ios" && native ? native.guidedAccess() : null;
}

// iOS: asks the system to start or end Guided Access. Only a supervised device that lists the app allows it.
export async function requestGuidedAccess(enabled: boolean): Promise<boolean> {
  return Platform.OS === "ios" && native ? await native.requestGuidedAccess(enabled) : false;
}

export type Watcher = Partial<{ [K in keyof Events]: Events[K] }>;

// How many callers are watching: the native watchers run while at least one is.
let watchers = 0;

// Starts the native watchers and passes their events on; returns what stops this caller's part.
export function watch(listeners: Watcher): () => void {
  const module = native;
  if (!module) return () => {};
  const subscriptions: EventSubscription[] = [];
  for (const name of Object.keys(listeners) as (keyof Events)[]) {
    const listener = listeners[name];
    if (listener) subscriptions.push(module.addListener(name, listener as never));
  }
  if (watchers++ === 0) void module.startWatching();
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    subscriptions.forEach((s) => s.remove());
    if (--watchers === 0) void module.stopWatching();
  };
}
