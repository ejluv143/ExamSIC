import { useEffect, useRef, useState, type RefObject } from "react";
import type { AnswerValue } from "@examinus/domain/quiz";
import type { TakeMode, Typing } from "./types.ts";

const saveDelayMs = 800;
const retrySaveMs = 5000;

// Answers are saved as they change, one question at a time: `queue` waits a moment for more typing, then sends
// the answer (with its typing history and the time the question was on screen). Saving fails in two ways: the
// server can't be reached (the answer is kept and sent again), or it no longer takes answers because time is up
// (`submitRef` hands in what there is). `finalizing`: the submit is under way, so nothing is retried.
export function useAnswerSaving({
  takeRef,
  typing,
  timeSpentRef,
  finalizing,
  submitRef,
}: {
  takeRef: RefObject<TakeMode | undefined>;
  typing: RefObject<Typing>;
  timeSpentRef: RefObject<(id: string) => number>;
  finalizing: RefObject<boolean>;
  submitRef: RefObject<(forced?: boolean) => Promise<void>>;
}) {
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const pending = useRef(new Map<string, AnswerValue>());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const inflight = useRef(0);

  async function flush(id: string) {
    timers.current.delete(id);
    const value = pending.current.get(id);
    const current = takeRef.current;
    if (value === undefined || !current) return;
    pending.current.delete(id);
    inflight.current++;
    let error: string | null = null;
    let offline = false;
    try {
      error = await current.onSave(id, value, typing.current[id], timeSpentRef.current(id));
    } catch {
      offline = true;
    }
    inflight.current--;
    if (offline) {
      setSaveState("error");
      // Keep trying, unless a newer answer is already waiting.
      if (!pending.current.has(id) && !finalizing.current) {
        pending.current.set(id, value);
        timers.current.set(id, setTimeout(() => void flush(id), retrySaveMs));
      }
    } else if (error) {
      // The server stopped taking answers (time is up): hand in what we have.
      setSaveState("error");
      if (!finalizing.current) void submitRef.current(true);
    } else if (inflight.current === 0 && timers.current.size === 0) setSaveState("saved");
  }

  function queue(id: string, v: AnswerValue) {
    pending.current.set(id, v);
    clearTimeout(timers.current.get(id));
    timers.current.set(id, setTimeout(() => void flush(id), saveDelayMs));
    setSaveState("saving");
  }

  // Sends the question's waiting answer now (moving to another question).
  function flushNow(id: string) {
    clearTimeout(timers.current.get(id));
    return flush(id);
  }

  // Drops what is waiting: the submit sends every answer itself.
  function discard() {
    for (const t of timers.current.values()) clearTimeout(t);
    timers.current.clear();
    pending.current.clear();
  }

  useEffect(() => {
    const waiting = timers.current;
    return () => {
      for (const t of waiting.values()) clearTimeout(t);
    };
  }, []);

  return { saveState, queue, flushNow, discard };
}
