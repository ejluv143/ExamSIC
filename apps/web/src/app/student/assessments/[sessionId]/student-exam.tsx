"use client";

import { useRef, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import type { Paper } from "@examora/contract";
import { OnlineExam } from "@/components/online-exam";
import type { Class } from "@/lib/types";
import { recordExamEvents, runSampleTests, saveExamAnswer, startExam, submitExam } from "../../actions";

const noSubscribe = () => () => {};

export function StudentExam({
  paper,
  classes,
  watermark,
}: {
  paper: Paper;
  classes: Class[];
  watermark: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const sessionId = paper.session.id;
  const attemptId = paper.attempt?.id;
  // Full screen and the integrity checks need the browser, so the exam only renders there.
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
        paper={paper}
        classes={classes}
        take={{
          onStart: async () => {
            const started = await startExam(sessionId);
            if ("error" in started) return started.error;
            // The paper only has the questions once the attempt has started.
            router.refresh();
            return null;
          },
          onSave: async (questionId, value, typing) => {
            if (!attemptId) return "This attempt hasn't started.";
            const saved = await saveExamAnswer(attemptId, questionId, value, typing);
            return "error" in saved ? saved.error : null;
          },
          onEvents: async (events) => {
            if (!attemptId) return null;
            const recorded = await recordExamEvents(attemptId, events);
            return recorded && "error" in recorded ? recorded.error : null;
          },
          onSubmit: async (answers, events, typing) => {
            if (!attemptId) return "This attempt hasn't started.";
            return submitExam(sessionId, attemptId, answers, events, typing);
          },
          runCode:
            paper.codeRunner && attemptId
              ? (questionId, code) => runSampleTests(attemptId, questionId, code)
              : undefined,
          watermark,
          fullscreenRoot: root,
        }}
      />
    </div>
  );
}
