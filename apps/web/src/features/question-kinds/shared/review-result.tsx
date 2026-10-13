import type { ReactNode } from "react";
import { Check, X } from "lucide-react";
import { Markdown } from "@/components/markdown";
import { answerKey, answerText } from "@examinus/domain/answer-text";
import type { PartResult } from "@examinus/domain/kinds/base";
import type { Question } from "@examinus/domain/question";
import type { AnswerValue } from "@examinus/domain/quiz";

// The frame of the result of one question: what the type shows of the answer (`children`), then the teacher's
// feedback and the explanation. `feedback` is the plain text of the comment.
export function ResultFrame({
  q,
  urls,
  feedback,
  children,
}: {
  q: Question;
  urls: Record<string, string>;
  feedback: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1 text-sm">
      {children}
      {feedback && (
        <Markdown className="rounded-md bg-info-soft px-2 py-1 text-info" assetUrls={urls}>
          {feedback}
        </Markdown>
      )}
      {q.explanation && (
        <Markdown className="rounded-md bg-surface-muted px-2 py-1 text-muted" assetUrls={urls}>
          {q.explanation}
        </Markdown>
      )}
    </div>
  );
}

export function NoAnswer() {
  return <p className="italic text-muted">No answer</p>;
}

// The right answer under one that wasn't fully right.
export function ResultKey({ q, full, urls }: { q: Question; full: boolean; urls: Record<string, string> }) {
  if (full) return null;
  return (
    <p className="text-success">
      <span className="text-muted">Correct: </span>
      <Markdown inline assetUrls={urls}>{answerKey(q)}</Markdown>
    </p>
  );
}

// The answer on one line, with whatever the type adds under it (`children`).
export function YourAnswer({
  q,
  answer,
  urls,
  children,
}: {
  q: Question;
  answer: AnswerValue;
  urls: Record<string, string>;
  children?: ReactNode;
}) {
  const yours = answerText(q, answer);
  return (
    <div>
      <p>
        <span className="text-muted">Your answer: </span>
        {yours ? <Markdown inline assetUrls={urls}>{yours}</Markdown> : <span className="italic text-muted">No answer</span>}
      </p>
      {children}
    </div>
  );
}

// An answer in code or SQL, as typed.
export function CodeResult({ q, answer }: { q: Question; answer: AnswerValue }) {
  const yours = answerText(q, answer);
  return yours ? (
    <pre className="max-h-72 overflow-auto rounded-md bg-surface-muted p-3 font-mono text-xs">{yours}</pre>
  ) : (
    <NoAnswer />
  );
}

// An answer in words, shown as the markdown it is.
export function EssayResult({ q, answer, urls }: { q: Question; answer: AnswerValue; urls: Record<string, string> }) {
  const yours = answerText(q, answer);
  return yours ? <Markdown className="rounded-md bg-surface-muted p-3" assetUrls={urls}>{yours}</Markdown> : <NoAnswer />;
}

// Each blank, pair or listed item with a mark for whether it matched the key. `prefix` goes before what was given
// (the left item of a pair) and `hint` after a wrong one (the right item).
export function PartsResult({
  parts,
  urls,
  prefix,
  hint,
}: {
  parts: readonly PartResult[];
  urls: Record<string, string>;
  prefix?: (index: number) => ReactNode;
  hint?: (index: number) => ReactNode;
}) {
  return (
    <ul className="space-y-1">
      {parts.map((part, k) => (
        <li key={k} className="flex items-start gap-2">
          {part.correct ? (
            <Check className="mt-0.5 size-4 shrink-0 text-success" aria-label="Correct" />
          ) : (
            <X className="mt-0.5 size-4 shrink-0 text-danger" aria-label="Wrong" />
          )}
          <span className="min-w-0 flex-1">
            {prefix?.(k)}
            {part.given ? (
              <Markdown inline assetUrls={urls}>{part.given}</Markdown>
            ) : (
              <span className="italic text-muted">No answer</span>
            )}
            {!part.correct && hint?.(k)}
          </span>
        </li>
      ))}
    </ul>
  );
}
