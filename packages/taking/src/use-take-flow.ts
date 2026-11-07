import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { PendingStorage } from "./pending-saves.ts";
import { createTakeFlow, type LeaveOutcome, type TakeFlow, type TakeFlowDeps, type TakeFlowState } from "./take-flow.ts";
import type { Answers, ServedTyping } from "./types.ts";
import { useAttemptLink } from "./use-attempt-link.ts";

// The taking flow (see ./take-flow.ts) for a screen. `deps` is what the screen knows on this render; the flow reads
// the latest when a timer or an await needs it. `answers` and `typing` are what the server has when the screen opens.
// The rest is the screen's clock and paper wired to the flow, so no screen repeats it:
// - `link`: keeps the server in the picture (events, check-in) while `active`; see ./attempt-link.ts.
// - `served`: one question at a time, each move re-reads the paper; what the server has for the question now on
//   screen joins what will be submitted. `index` is null when the paper is on one page.
// - `timing`: at zero seconds the answers are handed in, or the next question comes. A question that runs out is
//   retried on every `tick` until the server, whose clock may be a moment behind, has moved on.
export function useTakeFlow({
  deps,
  storage,
  answers,
  typing,
  link,
  served,
  timing,
}: {
  deps: TakeFlowDeps;
  storage?: PendingStorage;
  answers: Answers;
  typing: ServedTyping;
  link: { active: boolean; onRefused: (message: string | null) => void; onWake?: (beat: () => void) => () => void };
  served: { index: number | null; answers: Answers; typing: ServedTyping };
  timing: {
    active: boolean;
    secondsLeft: number | null;
    questionSecondsLeft: number | null;
    questionDeadline: number | null;
    isLast: boolean;
    tick: number;
    // The result of the question's time running out (see `TakeFlow.questionTimeUp`).
    onMoved: (outcome: LeaveOutcome | null) => void;
  };
}): { flow: TakeFlow; state: TakeFlowState } {
  const depsRef = useRef(deps);
  const [flow] = useState(() => createTakeFlow({ deps: () => depsRef.current, storage, answers, typing }));
  const servedRef = useRef(served);
  const movedRef = useRef(timing.onMoved);
  useEffect(() => {
    depsRef.current = deps;
    servedRef.current = served;
    movedRef.current = timing.onMoved;
  });
  useEffect(() => () => flow.dispose(), [flow]);
  useAttemptLink({ link: flow.link, active: link.active, onRefused: link.onRefused, onWake: link.onWake });

  useEffect(() => {
    if (servedRef.current.index === null) return;
    flow.merge(servedRef.current.answers, servedRef.current.typing);
  }, [served.index, flow]);

  const { active, secondsLeft, questionSecondsLeft, questionDeadline, isLast, tick } = timing;
  useEffect(() => {
    if (active && secondsLeft === 0) void flow.deadlineReached();
  }, [active, secondsLeft, flow]);
  useEffect(() => {
    if (!active || questionSecondsLeft !== 0) return;
    void flow.questionTimeUp(isLast).then((outcome) => movedRef.current(outcome));
  }, [active, questionSecondsLeft, isLast, questionDeadline, tick, flow]);

  const state = useSyncExternalStore(flow.subscribe, flow.getState, flow.getState);
  return { flow, state };
}
