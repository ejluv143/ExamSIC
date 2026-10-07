"use client";

import { useRef, useSyncExternalStore } from "react";
import { OnlineExam } from "@/components/online-exam";
import type { Assessment, Class } from "@/lib/types";
import { runSampleTests, startExam, submitExam } from "../../actions";

const noSubscribe = () => () => {};

export function StudentExam({
  assessment,
  classes,
  attemptsUsed,
  studentId,
  watermark,
  codeRunner,
}: {
  assessment: Assessment;
  classes: Class[];
  attemptsUsed: number;
  studentId: string;
  watermark: string;
  codeRunner: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  // The exam restores a saved draft from this browser, so it only renders client-side.
  const inBrowser = useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
  if (!inBrowser) return <div className="mx-auto h-96 max-w-2xl animate-pulse rounded-xl bg-surface-muted" />;

  return (
    // In full screen it scrolls on its own and needs its own background (the default is black).
    <div
      ref={root}
      className="@container [&:fullscreen]:overflow-y-auto [&:fullscreen]:bg-background [&:fullscreen]:p-4 sm:[&:fullscreen]:p-8"
    >
      <OnlineExam
        assessment={assessment}
        classes={classes}
        take={{
          attemptsUsed,
          draftKey: `examora:attempt:${studentId}:${assessment.id}:${attemptsUsed + 1}`,
          onSubmit: (answers, startedAt, events, typing) =>
            submitExam(assessment.id, answers, startedAt, events, typing),
          onStart: () => startExam(assessment.id),
          runCode: codeRunner ? (questionId, code) => runSampleTests(assessment.id, questionId, code) : undefined,
          watermark,
          fullscreenRoot: root,
        }}
      />
    </div>
  );
}
