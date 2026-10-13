import { MonitorX, ShieldCheck } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import { attemptLabel } from "@/features/attempt/attempts";
import type { Paper } from "@examinus/contract/attempt";
import { integrityRules } from "@examinus/domain/integrity";
import type { Class } from "@/features/classes/types";
import { Markdown } from "@/components/markdown";
import { Button, Card, inputClass } from "@/components/ui";

// What the student reads before pressing Start: the numbers, the exam's rules and, for a student, the room password.
export function IntroScreen({
  paper,
  classes,
  taking,
  kind,
  assetUrls,
  roomPassword,
  onRoomPassword,
  startError,
  starting,
  noQuestions,
  onStart,
}: {
  paper: Paper;
  classes: Class[];
  // A student takes it for real (not the teacher's preview).
  taking: boolean;
  // "exam", "quiz"…, lower case.
  kind: string;
  assetUrls: Record<string, string>;
  roomPassword: string;
  onRoomPassword: (v: string) => void;
  startError: string | null;
  starting: boolean;
  // A preview of a quiz with no questions has nothing to start.
  noQuestions: boolean;
  onStart: () => void;
}) {
  const { session, quiz } = paper;
  const limit = session.timeLimitMinutes;
  const navigationRule = session.oneQuestionAtATime
    ? {
        free: "Questions come one at a time, and you can go back to any of them.",
        marked_only: "Questions come one at a time. Once you move on, you can only come back to questions you marked for review.",
        forward_only: "Questions come one at a time, and you can't go back to a question once you move on.",
      }[session.navigation]
    : null;
  const ruleList = [
    ...integrityRules(session.integrity, kind),
    navigationRule,
    session.oneQuestionAtATime &&
      session.questionTimeLimitSeconds !== null &&
      `Each question has ${session.questionTimeLimitSeconds} seconds. A question whose time runs out can't be opened again, even if it's marked for review.`,
    session.maxMarked !== null && session.maxMarked > 0 && `You can mark up to ${session.maxMarked} ${session.maxMarked === 1 ? "question" : "questions"} for review at a time.`,
    session.ipRestricted && "It can only be taken on the school network.",
    session.lateJoinMinutes !== null && `You can only start in the first ${session.lateJoinMinutes} minutes.`,
  ].filter((x): x is string => !!x);

  const course = classes.map((c) => `${c.courseCode} · ${c.section}`).join(", ");
  const retakes = session.attemptsAllowed === null ? "Unlimited" : session.attemptsAllowed - 1 || "None";

  return (
    <Card className="mx-auto max-w-2xl overflow-hidden">
      <div className="border-b border-border bg-primary-soft px-6 py-5">
        <p className="text-xs font-semibold tracking-wide text-primary uppercase">
          {quiz.header.school} · {course || "No class assigned"}
        </p>
        <h1 className="mt-1 text-xl font-semibold">{quiz.title || "Untitled"}</h1>
      </div>
      <div className="space-y-5 p-6">
        <dl className="grid grid-cols-2 gap-3 text-sm @lg:grid-cols-4">
          {[
            ...(paper.questionCount > 0
              ? [
                  ["Questions", paper.questionCount],
                  ["Points", Math.round(paper.totalPoints * 100) / 100],
                ]
              : []),
            ["Time limit", limit ? `${limit} min` : "None"],
            ["Retakes", retakes],
          ].map(([k, v]) => (
            <div key={String(k)} className="rounded-lg bg-surface-muted px-3 py-2">
              <dt className="text-xs text-muted">{k}</dt>
              <dd className="font-semibold tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
        {session.closesAt && <p className="text-sm text-muted">Closes {formatDateTime(session.closesAt)}.</p>}
        {quiz.description && (
          <Markdown className="text-sm" assetUrls={assetUrls}>
            {quiz.description}
          </Markdown>
        )}
        {ruleList.length > 0 && (
          <div className="rounded-lg bg-warning-soft p-3 text-sm text-warning">
            <p className="flex items-center gap-2 font-medium">
              <ShieldCheck className="size-4 shrink-0" aria-hidden /> Exam rules
            </p>
            <ul className="mt-1.5 list-disc space-y-0.5 pl-6">
              {ruleList.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
        )}
        {taking && (
          <p className="text-sm text-muted">
            {session.attemptsAllowed === 1
              ? `You can take this ${kind} once; there are no retakes.`
              : `This is ${attemptLabel(paper.attemptsUsed + 1, session.attemptsAllowed)}.`}
            {limit !== null && " The timer starts when you press Start and keeps running if you leave the page."}
          </p>
        )}
        {taking && session.roomPasswordRequired && (
          <label className="block text-sm">
            <span className="font-medium">Room password</span>
            <input
              type="text"
              autoComplete="off"
              value={roomPassword}
              onChange={(e) => onRoomPassword(e.target.value)}
              placeholder="Your teacher will tell you"
              className={`${inputClass} mt-1`}
            />
          </label>
        )}
        {startError && (
          <p role="alert" className="flex gap-2 rounded-lg bg-danger-soft p-3 text-sm text-danger">
            <MonitorX className="mt-0.5 size-4 shrink-0" aria-hidden />
            {startError}
          </p>
        )}
        <Button className="w-full" onClick={onStart} disabled={starting || (!taking && noQuestions)}>
          {!taking && noQuestions ? "No questions yet" : starting ? "Starting…" : `Start ${kind}`}
        </Button>
      </div>
    </Card>
  );
}
