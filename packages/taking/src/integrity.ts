import { useEffect, useState } from "react";
import { awayCount } from "@examinus/domain/integrity";
import type { IntegrityEvent, IntegrityEventType, IntegritySettings } from "@examinus/domain/quiz";

export type IntegrityNotice = { kind: "away" | "blocked"; message: string } | null;

// Leaving counts once per incident: from when the student leaves until they're back (focused, and in
// full screen when that's required) and have stayed back this long. Going in and out of full screen
// briefly takes focus away on many systems; those blips belong to the same incident, not new ones.
export const settleMs = 1500;
// How often an open incident checks whether the student is back.
export const settleCheckMs = 300;
// The blur from a dialog can arrive just after it closes.
export const suppressTailMs = 300;

// What a sensor reports into the log. A sensor watches one thing on one platform (browser listeners, the OS of a phone)
// and tells the log when it sees something.
export type IntegrityEmit = {
  // Logs an event. `notice` also shows the student a "blocked" notice with that text.
  record(type: IntegrityEventType, options?: { notice?: string }): void;
  // The student left (the page, the app, full screen). Counts once per incident, with how long they were gone, and
  // shows an "away" notice. `fullscreenExit`: this is the student leaving full screen; when they had gone back into it
  // since the last warning (see `reenteredFullscreen`) that is always a new incident, however quickly it follows.
  away(type: IntegrityEventType, message: string, options?: { fullscreenExit?: boolean }): void;
  // Whether the student is back right now: every sensor that has an opinion (`IntegritySensor.back`) agrees.
  isBack(): boolean;
  // The student went (back) into full screen since the last warning.
  reenteredFullscreen(): void;
  // A second screen is connected right now (or no longer).
  secondScreen(connected: boolean): void;
};

export type IntegritySensor = {
  // Starts watching; returns what stops it.
  start(emit: IntegrityEmit): () => void;
  // What "back" means for this platform (on the page and, when full screen is required, in full screen). While an
  // incident is open the log polls it; with no sensor answering, the student counts as back.
  back?(): boolean;
};

type Clock = () => number;
type IntegrityLogHooks = {
  onChange: (events: IntegrityEvent[]) => void;
  onNotice: (notice: IntegrityNotice) => void;
  onSecondScreen?: (connected: boolean) => void;
  now?: Clock;
};


// The log and its away-incident state machine, without React or timers of its own (except `withoutTracking`'s tail).
export class IntegrityLog {
  private events: IntegrityEvent[];
  // An incident is open from leaving until the student has settled back; starts open so the switch
  // into full screen at Start doesn't count.
  private incident = true;
  // The away event waiting for its duration (index in the log), and when the student left.
  private open: { index: number; since: number } | null = null;
  // Our own confirm() dialogs blur the window; they shouldn't count against the student.
  private suppressed = false;
  private limitReached = false;
  private backSince: number | null = null;
  // Whether the student went (back) into full screen since the last warning.
  private reentered = false;
  private readonly hooks: IntegrityLogHooks;

  constructor(initial: IntegrityEvent[], hooks: IntegrityLogHooks) {
    this.events = initial;
    this.hooks = hooks;
  }

  private now(): number {
    return (this.hooks.now ?? Date.now)();
  }

  get log(): IntegrityEvent[] {
    return this.events;
  }

  // Sensors are about to start: the first switch (into full screen at Start) belongs to no incident.
  begin() {
    this.incident = true;
    this.backSince = null;
  }

  record(type: IntegrityEventType, options?: { notice?: string }) {
    this.events = [...this.events, { type, at: new Date(this.now()).toISOString() }];
    this.hooks.onChange(this.events);
    if (options?.notice !== undefined) this.hooks.onNotice({ kind: "blocked", message: options.notice });
  }

  away(type: IntegrityEventType, message: string, options?: { fullscreenExit?: boolean }) {
    // Leaving full screen after going back into it is always a new warning, however quickly it
    // happens. Without going back in first (Alt+Tab drops full screen too) it's the same warning.
    if (options?.fullscreenExit && this.reentered) {
      this.incident = false;
      this.closeOpen(this.now());
    }
    this.backSince = null;
    if (this.incident || this.suppressed) return;
    this.incident = true;
    this.reentered = false;
    this.record(type);
    this.open = { index: this.events.length - 1, since: this.now() };
    this.hooks.onNotice({ kind: "away", message });
  }

  reenteredFullscreen() {
    this.reentered = true;
  }

  secondScreen(connected: boolean) {
    this.hooks.onSecondScreen?.(connected);
  }

  // While an incident is open, call this a few times a second; it closes the incident once the student has stayed back
  // for settleMs. (Waiting for an event to say they're back isn't reliable: the focus or full-screen event can arrive
  // before the platform reports the new state.)
  settle(back: boolean) {
    if (!this.incident) return;
    if (!back) this.backSince = null;
    else if (this.backSince === null) this.backSince = this.now();
    else if (this.now() - this.backSince >= settleMs) {
      this.incident = false;
      this.closeOpen(this.backSince);
    }
  }

  // Closes the open away event with the time the student was gone.
  private closeOpen(until: number) {
    const current = this.open;
    if (!current) return;
    this.open = null;
    if (!this.events[current.index]) return;
    this.events = this.events.map((e, i) =>
      i === current.index ? { ...e, durationMs: Math.max(0, Math.round(until - current.since)) } : e,
    );
    this.hooks.onChange(this.events);
  }

  // autoSubmitAfter is how many times a student may leave and come back; leaving once more submits. Returns the
  // whole log, closed and with the submit marked, the one time the limit is passed; null otherwise.
  limit(autoSubmitAfter: number | null): IntegrityEvent[] | null {
    if (autoSubmitAfter === null || this.limitReached || awayCount(this.events) <= autoSubmitAfter) return null;
    this.limitReached = true;
    const at = this.now();
    this.closeOpen(at);
    return [...this.events, { type: "auto_submitted", at: new Date(at).toISOString() }];
  }

  // The events the server doesn't have yet that are complete: the one waiting for its duration (the student
  // is still away) and everything after it wait for the next round.
  pending(sent: number): { events: IntegrityEvent[]; end: number } {
    const end = this.open ? this.open.index : this.events.length;
    return { events: this.events.slice(sent, end), end };
  }

  // Everything, with the open away event closed at this moment: for the final submit.
  finish(): IntegrityEvent[] {
    this.closeOpen(this.now());
    return this.events;
  }

  // Run something (like confirm()) that takes focus away without counting it as leaving.
  withoutTracking<T>(fn: () => T): T {
    this.suppressed = true;
    try {
      return fn();
    } finally {
      setTimeout(() => {
        this.suppressed = false;
      }, suppressTailMs);
    }
  }
}

// Keeps the integrity log of an attempt while it's taken: sensors (what the platform can watch) report into it, it
// counts leaving once per incident, and calls onLimit once they've left more often than allowed. Only runs while
// `active`. `sensors` must be stable between renders (memoize it); a new list restarts the sensors.
export function useIntegrityLog({
  active,
  settings,
  initial,
  onLimit,
  sensors,
}: {
  active: boolean;
  settings: IntegritySettings;
  initial: IntegrityEvent[];
  onLimit: (events: IntegrityEvent[]) => void;
  sensors: readonly IntegritySensor[];
}) {
  const [events, setEvents] = useState(initial);
  const [notice, setNotice] = useState<IntegrityNotice>(null);
  const [secondScreen, setSecondScreen] = useState(false);
  const [log] = useState(() => new IntegrityLog(initial, { onChange: setEvents, onNotice: setNotice, onSecondScreen: setSecondScreen }));
  const [latest] = useState(() => ({ onLimit }));
  useEffect(() => {
    latest.onLimit = onLimit;
  });

  const { autoSubmitAfter, blockSecondScreen } = settings;

  useEffect(() => {
    if (!active) return;
    log.begin();
    const isBack = () => sensors.every((s) => s.back?.() ?? true);
    const settle = setInterval(() => log.settle(isBack()), settleCheckMs);
    const emit: IntegrityEmit = {
      record: (type, options) => log.record(type, options),
      away: (type, message, options) => log.away(type, message, options),
      isBack,
      reenteredFullscreen: () => log.reenteredFullscreen(),
      secondScreen: (connected) => log.secondScreen(connected),
    };
    const stops = sensors.map((s) => s.start(emit));
    return () => {
      clearInterval(settle);
      stops.forEach((stop) => stop());
    };
  }, [active, sensors, log]);

  const timesAway = awayCount(events);
  useEffect(() => {
    if (!active) return;
    const all = log.limit(autoSubmitAfter);
    if (all) latest.onLimit(all);
  }, [active, autoSubmitAfter, timesAway, log, latest]);

  return {
    events,
    timesAway,
    notice,
    // A second monitor is connected right now; the exam is covered until it's unplugged.
    secondScreen: active && blockSecondScreen && secondScreen,
    dismissNotice: () => setNotice(null),
    pending: (sent: number) => log.pending(sent),
    finish: () => log.finish(),
    withoutTracking: <T>(fn: () => T): T => log.withoutTracking(fn),
  };
}
