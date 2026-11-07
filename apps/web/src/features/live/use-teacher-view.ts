"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "@examinus/domain/quiz";
import {
  deviceChangeFound,
  dismissToast,
  reduce,
  startTeacherView,
  type TeacherView,
  type Watch,
} from "@examinus/client/teacher-view";
import { followTeacher, type LiveStatus } from "./client";

// Follows the teacher stream of one session into the pure teacher view (packages/client). `readDeviceChange` answers
// the view's requests for an attempt's last device change (an ISO time, or undefined when it never changed device).
export function useTeacherView({
  sessionId,
  watch,
  session,
  readDeviceChange,
}: {
  sessionId: string;
  watch: Watch;
  session?: Session;
  readDeviceChange?: (attemptId: string) => Promise<string | undefined>;
}) {
  const [view, setView] = useState<TeacherView>(() => startTeacherView(watch, session));
  const [status, setStatus] = useState<LiveStatus>("connecting");
  // Events and answers to requests can arrive back to back, so each builds on the latest state, not on a render's.
  const latest = useRef(view);
  const apply = useCallback((next: TeacherView) => {
    latest.current = next;
    setView(next);
  }, []);
  const read = useRef(readDeviceChange);
  useEffect(() => {
    read.current = readDeviceChange;
  }, [readDeviceChange]);

  useEffect(
    () =>
      followTeacher(sessionId, {
        onStatus: setStatus,
        onEvent: (event) => {
          const step = reduce(latest.current, event, Date.now());
          apply(step.view);
          for (const { attemptId } of step.requests)
            void read
              .current?.(attemptId)
              .then((at) => apply(deviceChangeFound(latest.current, attemptId, at)))
              .catch(() => undefined);
        },
      }),
    [sessionId, apply],
  );

  const dismiss = useCallback((id: string) => apply(dismissToast(latest.current, id)), [apply]);

  return { view, status, dismiss };
}
