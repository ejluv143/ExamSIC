import { useEffect, useRef, type RefObject } from "react";
import type { IntegrityEvent } from "@examinus/domain/quiz";
import type { TakeMode } from "./types.ts";

// Short, so the teacher's live view shows an alert within a second or two of the student coming back.
const eventsFlushMs = 1000;
const heartbeatMs = 15_000;

// What keeps the server in the picture while the student takes the exam: the integrity events, sent every so often so
// they survive a closed browser, and the check-in that lets the server notice a lost connection. Returns how many of
// the events the server already has. Neither runs once the submit is under way (`finalizing`). `onRefused` gets the
// refusal when the attempt can't go on here (another browser or network), or null when it can.
export function useAttemptLink({
  active,
  takeRef,
  guardRef,
  finalizing,
  onRefused,
  onWake,
}: {
  active: boolean;
  takeRef: RefObject<TakeMode | undefined>;
  guardRef: RefObject<{ pending(sent: number): { events: IntegrityEvent[]; end: number } }>;
  finalizing: RefObject<boolean>;
  onRefused: (message: string | null) => void;
  // Checks in again the moment the app comes back (the page becomes visible, the phone's app is foregrounded).
  // Gets the check-in to run; returns what stops listening.
  onWake?: (beat: () => void) => () => void;
}) {
  const sentEvents = useRef(0);
  const refusedRef = useRef(onRefused);
  useEffect(() => {
    refusedRef.current = onRefused;
  });

  // An away event is held back until the student is back, so it goes with its duration.
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(async () => {
      if (finalizing.current) return;
      const from = sentEvents.current;
      const { events, end } = guardRef.current.pending(from);
      if (events.length === 0) return;
      sentEvents.current = end;
      const failed = await takeRef.current?.onEvents(events).then((e) => !!e, () => true);
      if (failed && !finalizing.current) sentEvents.current = Math.min(sentEvents.current, from);
    }, eventsFlushMs);
    return () => clearInterval(timer);
  }, [active, takeRef, guardRef, finalizing]);

  useEffect(() => {
    if (!active) return;
    const beat = () => {
      if (finalizing.current) return;
      takeRef.current?.onHeartbeat().then(
        (error) => refusedRef.current(error),
        () => {},
      );
    };
    beat();
    const timer = setInterval(beat, heartbeatMs);
    const unwake = onWake?.(beat);
    return () => {
      clearInterval(timer);
      unwake?.();
    };
  }, [active, takeRef, finalizing, onWake]);

  return sentEvents;
}
