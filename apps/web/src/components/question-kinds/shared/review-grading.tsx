import { CodeEditor, type EditorLanguage } from "@/components/code-editor";
import type { ReactNode } from "react";
import { Check, Keyboard, X } from "lucide-react";
import { Markdown } from "@/components/markdown";
import { TypingReplay } from "@/components/typing-replay";
import { Badge } from "@/components/ui";
import { analyzeTyping } from "@/lib/typing";
import { answerKey, answerText } from "@examinus/domain/answer-text";
import { rubricTotal, type RubricRow } from "@examinus/domain/kinds/base";
import type { Question } from "@examinus/domain/question";
import type { AnswerValue } from "@examinus/domain/quiz";
import { partResults, unitPoints } from "@examinus/domain/scoring";
import type { Grading } from "../views/review";

// The key as the teacher grades from it: the types without a box of their own show this one.
export function KeyBox({ q, urls }: { q: Question; urls: Record<string, string> }) {
  return (
    <div className="rounded-lg bg-info-soft p-3 text-sm">
      <p className="mb-0.5 font-medium text-info">Answer key</p>
      <Markdown assetUrls={urls}>{answerKey(q)}</Markdown>
    </div>
  );
}

// A free-text rubric (code and SQL): shown, not ticked.
export function RubricText({ rubric, urls }: { rubric: string; urls: Record<string, string> }) {
  return (
    <div className="rounded-lg bg-info-soft p-3 text-sm">
      <p className="mb-0.5 font-medium text-info">Rubric</p>
      <Markdown assetUrls={urls}>{rubric}</Markdown>
    </div>
  );
}

// The rubric rows to tick as quick scoring (essay and drawing); the score is their sum until the teacher types
// another.
export function RubricTicks({
  q,
  rubric,
  urls,
  grading,
}: {
  q: Question;
  rubric: readonly RubricRow[];
  urls: Record<string, string>;
  grading: Grading;
}) {
  if (rubric.length === 0) return null;

  function toggleRow(id: string) {
    const next = new Set(grading.ticked);
    if (!next.delete(id)) next.add(id);
    grading.setTicked(next);
    grading.setPoints(String(Math.min(q.points, rubricTotal(rubric.filter((r) => next.has(r.id))))));
  }

  return (
    <div className="rounded-lg bg-info-soft p-3 text-sm">
      <p className="mb-1.5 font-medium text-info">Rubric: tick what the answer earns</p>
      <ul className="space-y-1.5">
        {rubric.map((r) => (
          <li key={r.id}>
            <label className="flex cursor-pointer items-start gap-2">
              <input
                type="checkbox"
                checked={grading.ticked.has(r.id)}
                onChange={() => toggleRow(r.id)}
                className="mt-0.5 size-4 accent-primary"
              />
              <span className="min-w-0 flex-1">
                <Markdown inline assetUrls={urls}>{r.criterion}</Markdown>
              </span>
              <span className="tabular-nums text-muted">{r.points} pts</span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

// The "Student's answer" heading over what the type shows of it.
export function StudentAnswer({ children }: { children: ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-sm font-medium">Student&apos;s answer</p>
      {children}
    </div>
  );
}

// The answer as the teacher reads it: each blank, pair or item with its points when the type has them, else the
// text. `prefix` goes before what was given (the left item of a pair).
export function GradedAnswer({
  q,
  answer,
  urls,
  prefix,
}: {
  q: Question;
  answer: AnswerValue;
  urls: Record<string, string>;
  prefix?: (index: number) => ReactNode;
}) {
  const parts = partResults(q, answer);
  const unit = unitPoints(q);
  if (!parts)
    return (
      <div className="rounded-lg border border-border bg-surface-muted p-4 text-sm">
        {answerText(q, answer) ? (
          <Markdown assetUrls={urls}>{answerText(q, answer)}</Markdown>
        ) : (
          <span className="text-muted">No answer</span>
        )}
      </div>
    );
  return (
    <ol className="divide-y divide-border rounded-lg border border-border">
      {parts.map((p, i) => (
        <li key={i} className="flex items-center gap-3 px-3 py-2 text-sm">
          <span className="w-5 text-muted tabular-nums">{i + 1}.</span>
          <span className="min-w-0 flex-1">
            {p.given.trim() ? (
              prefix ? (
                <>
                  {prefix(i)} <Markdown inline assetUrls={urls}>{p.given}</Markdown>
                </>
              ) : (
                p.given
              )
            ) : (
              <span className="text-muted">No answer</span>
            )}
          </span>
          <span className="text-xs text-muted tabular-nums">
            {p.correct ? unit[i] : 0} / {unit[i]}
          </span>
          {p.correct ? (
            <Check className="size-4 text-success" aria-label="Matches the key" />
          ) : (
            <X className="size-4 text-danger" aria-label="Doesn't match the key" />
          )}
        </li>
      ))}
    </ol>
  );
}

// Collapsed by default; the summary already says whether anything looked unusual.
export function GradingReplay(props: Parameters<typeof TypingReplay>[0]) {
  const flags = analyzeTyping(props.initial, props.edits, props.final).flags;
  return (
    <details className="rounded-lg border border-border">
      <summary className="flex cursor-pointer items-center gap-2 px-3 py-2.5 text-sm">
        <Keyboard className="size-4 text-muted" aria-hidden />
        <span className="flex-1 font-medium">Typing replay</span>
        {flags.length > 0 ? (
          <Badge tone="warning">
            {flags.length} {flags.length === 1 ? "warning" : "warnings"}
          </Badge>
        ) : (
          <span className="text-xs text-muted">Typed normally</span>
        )}
      </summary>
      <div className="border-t border-border p-3">
        <TypingReplay {...props} />
      </div>
    </details>
  );
}

// The student's code or query, read-only.
export function GradedCode({ answer, language }: { answer: AnswerValue; language: EditorLanguage }) {
  return (
    <StudentAnswer>
      <CodeEditor value={typeof answer === "string" ? answer : ""} language={language} readOnly minLines={4} label="Student's code" />
    </StudentAnswer>
  );
}
