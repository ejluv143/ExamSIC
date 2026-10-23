// Per-student accommodations a teacher sets on a session roster. The API applies them to the clock, the attempt
// count and the rules the student sees.
import { Schema } from "effect";
import type { Session } from "./quiz.ts";

// The exam rules a student can be exempted from.
export const AccommodationExemption = Schema.Literals(["fullscreen", "one_screen", "computers_only"]);
export type AccommodationExemption = typeof AccommodationExemption.Type;

export const accommodationLimits = {
  timeMultiplier: { minimum: 1, maximum: 3 },
  extraMinutes: { minimum: 0, maximum: 600 },
  extraAttempts: { minimum: 0, maximum: 10 },
  noteLength: 500,
} as const;

// The multipliers the teacher can pick from.
export const timeMultipliers = [1, 1.25, 1.5, 2, 3] as const;

export const Accommodations = Schema.Struct({
  // Scales the session's time limit (not the close time). 1: no change.
  timeMultiplier: Schema.Number.check(Schema.isBetween(accommodationLimits.timeMultiplier)),
  // Minutes added after the limit and the close time, exactly like adding time live.
  extraMinutes: Schema.Int.check(Schema.isBetween(accommodationLimits.extraMinutes)),
  // Attempts on top of the session's attempts allowed (no effect when unlimited).
  extraAttempts: Schema.Int.check(Schema.isBetween(accommodationLimits.extraAttempts)),
  exempt: Schema.Array(AccommodationExemption),
  note: Schema.String.check(Schema.isMaxLength(accommodationLimits.noteLength)),
});
export type Accommodations = typeof Accommodations.Type;

export const noAccommodations: Accommodations = { timeMultiplier: 1, extraMinutes: 0, extraAttempts: 0, exempt: [], note: "" };

export const isEmptyAccommodations = (a: Accommodations | null | undefined): boolean =>
  a === null ||
  a === undefined ||
  (a.timeMultiplier === 1 && a.extraMinutes === 0 && a.extraAttempts === 0 && a.exempt.length === 0 && a.note.trim() === "");

// The session as this student sees it: the exempted rules are switched off.
export const applyAccommodations = (session: Session, a: Accommodations | null | undefined): Session => {
  if (a === null || a === undefined || a.exempt.length === 0) return session;
  const exempt = (rule: AccommodationExemption) => a.exempt.includes(rule);
  return {
    ...session,
    integrity: {
      ...session.integrity,
      ...(exempt("fullscreen") ? { requireFullscreen: false } : {}),
      ...(exempt("one_screen") ? { blockSecondScreen: false } : {}),
    },
    exam: session.exam !== null && exempt("computers_only") ? { ...session.exam, computersOnly: false } : session.exam,
  };
};
