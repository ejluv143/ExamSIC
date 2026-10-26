import { Keyboard } from "lucide-react";
import { CodeEditor } from "@/components/code-editor";
import { Markdown } from "@/components/markdown";
import { TypingReplay } from "@/components/typing-replay";
import { Badge } from "@/components/ui";
import { analyzeTyping } from "@examinus/taking/typing-analysis";
import { type TypingEdit } from "@examinus/domain/quiz";
import { answerText } from "@examinus/domain/answer-text";
import type { Question } from "@examinus/domain/question";
import type { AnswerValue } from "@examinus/domain/quiz";

// The answer as it stands, as text.
export function LiveText({ q, answer }: { q: Question; answer: AnswerValue | undefined }) {
  const shown = answerText(q, answer);
  return (
    <div className="rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm">
      {shown ? <Markdown>{shown}</Markdown> : <span className="text-muted">No answer yet</span>}
    </div>
  );
}

// The answer in code or SQL, with its typing replay when there are edits.
export function LiveCode({
  number,
  answer,
  edits,
  initial,
  language,
}: {
  number: number;
  answer: AnswerValue | undefined;
  edits: readonly TypingEdit[] | undefined;
  initial: string;
  language: Parameters<typeof TypingReplay>[0]["language"];
}) {
  const text = typeof answer === "string" ? answer : "";
  return (
    <>
      <CodeEditor value={text} language={language} readOnly minLines={3} label={`Answer to question ${number}`} />
      {edits && edits.length > 0 && <LiveReplay initial={initial} edits={edits} final={text} language={language} />}
    </>
  );
}

// Collapsed by default; the summary already says whether anything looked unusual.
export function LiveReplay(props: Parameters<typeof TypingReplay>[0]) {
  const flags = analyzeTyping(props.initial, props.edits, props.final).flags;
  return (
    <details className="rounded-lg border border-border bg-surface">
      <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm">
        <Keyboard className="size-4 text-muted" aria-hidden />
        <span className="flex-1 font-medium">Typing replay</span>
        {flags.length > 0 ? (
          <Badge tone="warning">
            {flags.length} {flags.length === 1 ? "warning" : "warnings"}
          </Badge>
        ) : (
          <Badge tone="success">Normal typing</Badge>
        )}
      </summary>
      <div className="border-t border-border p-3">
        <TypingReplay {...props} />
      </div>
    </details>
  );
}
