"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Lock, MessageSquareWarning, Pause, WifiOff } from "lucide-react";
import type { LiveStudentEvent, Paper, StudentEndReason } from "@examora/contract";
import { OnlineExam } from "@/components/online-exam";
import { Button } from "@/components/ui";
import { followStudent, type LiveStatus } from "@/lib/live/client";
import type { Class } from "@/lib/types";
import { advanceExam, examHeartbeat, recordExamEvents, runSampleTests, saveExamAnswer, startExam, submitExam } from "../../actions";
import { getDeviceId } from "@/lib/device";

const noSubscribe = () => () => {};

type LiveState = Extract<LiveStudentEvent, { _tag: "state" }>;
type Warning = { message: string; at: string };

const endedText: Record<StudentEndReason, string> = {
  teacher: "Your teacher submitted your attempt.",
  session_ended: "Your teacher ended the session, so your attempt was submitted.",
  time_up: "Time ran out, so your attempt was submitted.",
};

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
  // What the teacher is doing, pushed over the live connection. It starts from what the paper says.
  const [live, setLive] = useState<LiveState | null>(null);
  const [warnings, setWarnings] = useState<Warning[]>([]);
  const [ended, setEnded] = useState<StudentEndReason | null>(null);
  const wasPaused = useRef(paper.paused);
  const [connection, setConnection] = useState<LiveStatus>("connecting");
  const paused = live ? live.paused : paper.paused;
  const locked = live ? live.locked : paper.locked;

  useEffect(() => {
    if (!attemptId) return;
    return followStudent(attemptId, {
      onStatus: setConnection,
      onEvent: (event) => {
        if (event._tag === "warning") setWarnings((all) => [...all, { message: event.message, at: event.at }]);
        else if (event._tag === "ended") setEnded(event.reason);
        else {
          // After a pause the question's own clock moved too: load the paper again.
          if (wasPaused.current && !event.paused) router.refresh();
          wasPaused.current = event.paused;
          setLive(event);
          if (event.status !== "in_progress") setEnded((reason) => reason ?? "session_ended");
        }
      },
    });
  }, [attemptId, router]);

  // Once the server has submitted the attempt, show why and move on to the result.
  useEffect(() => {
    if (!ended) return;
    const timer = setTimeout(() => router.push(`/student/assessments/${sessionId}/result`), 4000);
    return () => clearTimeout(timer);
  }, [ended, router, sessionId]);

  // The clocks on screen follow the teacher: new deadline when time is added, and none while it is stopped
  // (the exam would otherwise hand in at zero).
  const shown = useMemo(
    () => ({
      ...paper,
      deadline: paused ? null : live ? live.deadline : paper.deadline,
      progress: paper.progress && paused ? { ...paper.progress, deadline: null } : paper.progress,
    }),
    [paper, live, paused],
  );
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
        paper={shown}
        classes={classes}
        take={{
          onStart: async (roomPassword) => {
            const started = await startExam(sessionId, getDeviceId(), roomPassword);
            if ("error" in started) return started.error;
            // The paper only has the questions once the attempt has started.
            router.refresh();
            return null;
          },
          onSave: async (questionId, value, typing, timeSpentMs) => {
            if (!attemptId) return "This attempt hasn't started.";
            const saved = await saveExamAnswer(attemptId, getDeviceId(), questionId, value, typing, timeSpentMs);
            return "error" in saved ? saved.error : null;
          },
          onEvents: async (events) => {
            if (!attemptId) return null;
            const recorded = await recordExamEvents(attemptId, getDeviceId(), events);
            return recorded && "error" in recorded ? recorded.error : null;
          },
          onHeartbeat: async () => {
            if (!attemptId) return null;
            const beat = await examHeartbeat(attemptId, getDeviceId());
            return "error" in beat ? beat.error : null;
          },
          onAdvance: async () => {
            if (!attemptId) return "This attempt hasn't started.";
            const moved = await advanceExam(attemptId, getDeviceId());
            if ("error" in moved) return moved.error;
            // The next question is only sent once the server has moved on.
            router.refresh();
            return null;
          },
          onSubmit: async (answers, events, typing) => {
            if (!attemptId) return "This attempt hasn't started.";
            return submitExam(sessionId, attemptId, getDeviceId(), answers, events, typing);
          },
          runCode:
            paper.codeRunner && attemptId
              ? (questionId, code) => runSampleTests(attemptId, questionId, code)
              : undefined,
          watermark,
          fullscreenRoot: root,
        }}
      />
      {attemptId && connection === "reconnecting" && !ended && (
        <p className="fixed bottom-3 left-3 z-40 inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted shadow">
          <WifiOff className="size-3.5" aria-hidden /> Reconnecting to your teacher…
        </p>
      )}
      {warnings.length > 0 && !ended && (
        <Notice icon={<MessageSquareWarning className="size-5 text-amber-600" aria-hidden />} title="Message from your teacher">
          <p className="whitespace-pre-wrap">{warnings[warnings.length - 1]!.message}</p>
          <div className="mt-4 flex justify-end">
            <Button onClick={() => setWarnings([])}>OK</Button>
          </div>
        </Notice>
      )}
      {ended && (
        <Notice icon={<Lock className="size-5" aria-hidden />} title="Attempt submitted" blocking>
          <p>{endedText[ended]}</p>
          <div className="mt-4 flex justify-end">
            <Button onClick={() => router.push(`/student/assessments/${sessionId}/result`)}>See my result</Button>
          </div>
        </Notice>
      )}
      {!ended && paused && (
        <Notice icon={<Pause className="size-5" aria-hidden />} title="Session paused" blocking>
          <p>Your teacher paused the session. Your time is stopped. Wait here, it will carry on by itself.</p>
        </Notice>
      )}
      {!ended && !paused && locked && (
        <Notice icon={<Lock className="size-5" aria-hidden />} title="Your attempt is locked" blocking>
          <p>Your teacher locked your attempt. Your answers are kept. Wait for them to unlock it.</p>
        </Notice>
      )}
    </div>
  );
}

// A message over the exam. `blocking` covers it so nothing underneath can be used.
function Notice({
  icon,
  title,
  blocking = false,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  blocking?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      role={blocking ? "alertdialog" : "alert"}
      aria-modal="true"
      aria-label={title}
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${blocking ? "bg-background/95" : "bg-black/40"}`}
    >
      <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-xl">
        <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold">
          {icon}
          {title}
        </h2>
        <div className="text-sm text-muted">{children}</div>
      </div>
    </div>
  );
}
