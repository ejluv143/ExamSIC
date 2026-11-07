// Which settings of a session can still change once it has opened or started. One table, so the API that refuses
// the edit and the form that locks the field agree.
import type { SessionStatus } from "./quiz.ts";

// `lobby`: from the moment the session opens (lobby or running); `running`: from the moment the teacher starts it.
// Students gather in the lobby under the first group (a game's players took their seats under its type and pacing);
// they take the session under the second group, so those rules stay as they started.
// `keep`: an edit is ignored and the setting stays as it was; `refuse`: an edit that changes it is turned down.
export const freezeTable = {
  mode: { from: "lobby", change: "keep" },
  pacing: { from: "lobby", change: "keep" },
  opensAt: { from: "lobby", change: "keep" },
  classId: { from: "lobby", change: "keep" },
  oneQuestionAtATime: { from: "running", change: "keep" },
  questionTimeLimitSeconds: { from: "running", change: "keep" },
  navigation: { from: "running", change: "keep" },
  maxMarked: { from: "running", change: "keep" },
  integrity: { from: "running", change: "keep" },
  exam: { from: "running", change: "keep" },
  mastery: { from: "running", change: "keep" },
  relay: { from: "running", change: "refuse" },
  relayPassword: { from: "running", change: "refuse" },
  relayClues: { from: "running", change: "refuse" },
} as const;

export type FrozenSetting = keyof typeof freezeTable;

// The stage a session is at, as far as editing goes. An ended session can't be edited at all.
const stage = { scheduled: 0, lobby: 1, running: 2, ended: 3 } as const satisfies Record<SessionStatus, number>;

// Whether the setting is locked in a session with this status.
export const isFrozen = (setting: FrozenSetting, status: SessionStatus): boolean =>
  status === "ended" || stage[status] >= stage[freezeTable[setting].from];

// The settings locked in a session with this status, optionally only those that are kept or refused.
export const frozenSettings = (status: SessionStatus, change?: "keep" | "refuse"): FrozenSetting[] =>
  (Object.keys(freezeTable) as FrozenSetting[]).filter((s) => isFrozen(s, status) && (change === undefined || freezeTable[s].change === change));

// The edited settings with every locked "keep" setting put back to what the session has. Only keys the session
// supplies are put back.
export function keepFrozen<S extends object>(edited: S, current: Partial<S>, status: SessionStatus): S {
  const kept = frozenSettings(status, "keep").filter((s) => s in current);
  return { ...edited, ...Object.fromEntries(kept.map((s) => [s, (current as Record<string, unknown>)[s]])) };
}

// Two settings values are the same when they hold the same data, whatever the order of an object's keys.
export function sameSetting(a: unknown, b: unknown): boolean {
  return canonical(a) === canonical(b);
}

function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v !== null && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0)))
      : v,
  );
}
