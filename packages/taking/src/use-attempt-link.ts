import { useEffect, useRef } from "react";
import type { TakeFlow } from "./take-flow.ts";

// Short, so the teacher's live view shows an alert within a second or two of the student coming back.
const eventsFlushMs = 1000;
const heartbeatMs = 15_000;

// What keeps the server in the picture while the student takes the exam: the integrity events (the flow's bound
// guard), sent every so often so they survive a closed browser, and the check-in that lets the server notice a lost
// connection. Neither runs once the submit is under way. `onRefused` gets the refusal when the attempt can't go on
// here (another browser or network), or null when it can.
export function useAttemptLink({
  active,
  flow,
  onRefused,
  onWake,
}: {
  active: boolean;
  flow: TakeFlow;
  onRefused: (message: string | null) => void;
  // Checks in again the moment the app comes back (the page becomes visible, the phone's app is foregrounded).
  // Gets the check-in to run; returns what stops listening.
  onWake?: (beat: () => void) => () => void;
}) {
  const refusedRef = useRef(onRefused);
  useEffect(() => {
    refusedRef.current = onRefused;
  });

  // An away event is held back until the student is back, so it goes with its duration.
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(async () => {
      if (flow.finalizing()) return;
      const from = flow.sentEvents.current;
      const { events, end } = flow.pendingEvents(from);
      if (events.length === 0) return;
      flow.sentEvents.current = end;
      const failed = await flow.take()?.onEvents(events).then((e) => !!e, () => true);
      if (failed && !flow.finalizing()) flow.sentEvents.current = Math.min(flow.sentEvents.current, from);
    }, eventsFlushMs);
    return () => clearInterval(timer);
  }, [active, flow]);

  useEffect(() => {
    if (!active) return;
    const beat = () => {
      if (flow.finalizing()) return;
      flow.take()?.onHeartbeat().then(
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
  }, [active, flow, onWake]);
}
