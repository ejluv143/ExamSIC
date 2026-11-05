import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { PendingStorage } from "./pending-saves.ts";
import { createTakeFlow, type TakeFlow, type TakeFlowDeps, type TakeFlowState } from "./take-flow.ts";
import type { Answers, ServedTyping } from "./types.ts";

// The taking flow (see ./take-flow.ts) for a screen. `deps` is what the screen knows on this render; the flow reads
// the latest when a timer or an await needs it. `answers` and `typing` are what the server has when the screen opens.
export function useTakeFlow({
  deps,
  storage,
  answers,
  typing,
}: {
  deps: TakeFlowDeps;
  storage?: PendingStorage;
  answers: Answers;
  typing: ServedTyping;
}): { flow: TakeFlow; state: TakeFlowState } {
  const depsRef = useRef(deps);
  const [flow] = useState(() => createTakeFlow({ deps: () => depsRef.current, storage, answers, typing }));
  useEffect(() => {
    depsRef.current = deps;
  });
  useEffect(() => () => flow.dispose(), [flow]);
  const state = useSyncExternalStore(flow.subscribe, flow.getState, flow.getState);
  return { flow, state };
}
