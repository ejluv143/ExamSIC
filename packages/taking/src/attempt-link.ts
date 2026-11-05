import type { IntegrityEvent } from "@examinus/domain/quiz";
import type { TakeMode } from "./types.ts";

// Short, so the teacher's live view shows an alert within a second or two of the student coming back.
const eventsFlushMs = 1000;
const heartbeatMs = 15_000;

// The integrity log the check-in reads: `finish` closes an away event that is still open and returns every event;
// `pending` is what the server doesn't have yet after the first `sent` events.
export type EventSource = {
  finish(): IntegrityEvent[];
  pending(sent: number): { events: IntegrityEvent[]; end: number };
};

export type AttemptLink = {
  // Starts the link; returns what stops it. `onRefused` gets the refusal when the attempt can't go on here (another
  // browser or network), or null when it can. `onWake` checks in again the moment the app comes back (the page
  // becomes visible, the phone's app is foregrounded): it gets the check-in to run and returns what stops listening.
  run(options: { onRefused?: ((message: string | null) => void) | undefined; onWake?: ((beat: () => void) => () => void) | undefined }): () => void;
};

// What keeps the server in the picture while the student takes the exam: the integrity events, sent every so often
// so they survive a closed browser (an away event is held back until the student is back, so it goes with its
// duration), and the check-in that lets the server notice a lost connection. Neither runs once `finalizing` says the
// submit is under way. Which events the server has is kept here: a submit asks `unsent` for the rest.
export function createAttemptLink({
  target,
  source,
  finalizing = () => false,
}: {
  // Missing in the teacher's preview: nothing is sent.
  target: () => Pick<TakeMode, "onEvents" | "onHeartbeat"> | undefined;
  source: () => EventSource | undefined;
  finalizing?: () => boolean;
}): AttemptLink & { unsent(all: IntegrityEvent[]): IntegrityEvent[] } {
  let sent = 0;

  async function flushEvents() {
    if (finalizing()) return;
    const from = sent;
    const { events, end } = source()?.pending(from) ?? { events: [], end: from };
    if (events.length === 0) return;
    sent = end;
    const failed = await target()?.onEvents(events).then((error) => !!error, () => true);
    // Not recorded: send them again, unless the submit now carries them.
    if (failed && !finalizing()) sent = Math.min(sent, from);
  }

  return {
    unsent: (all) => all.slice(sent),
    run({ onRefused, onWake }) {
      const flush = setInterval(() => void flushEvents(), eventsFlushMs);
      const beat = () => {
        if (finalizing()) return;
        target()?.onHeartbeat().then(
          (error) => onRefused?.(error),
          () => {},
        );
      };
      beat();
      const heartbeat = setInterval(beat, heartbeatMs);
      const unwake = onWake?.(beat);
      return () => {
        clearInterval(flush);
        clearInterval(heartbeat);
        unwake?.();
      };
    },
  };
}
