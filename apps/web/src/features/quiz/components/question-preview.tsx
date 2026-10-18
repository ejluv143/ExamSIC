"use client";

import { useContext, useState } from "react";
import { Markdown } from "@/components/markdown";
import { QuestionTypeBadge } from "@/components/question-kinds/question-style";
import { EditorAssetUrls } from "@/components/question-kinds/shared/editor-image-field";
import { modelOf } from "@/components/question-kinds/views/editor-model";
import { AnswerInput } from "@/components/question-kinds/views/input";
import { Card } from "@/components/ui";
import { toStudentQuestion } from "@examinus/domain/question";
import type { Question, StudentQuestion } from "@examinus/domain/question";
import type { AnswerValue } from "@examinus/domain/quiz";


const noop = () => {};
const pointsLabel = (n: number) => `${n} ${n === 1 ? "pt" : "pts"}`;

// What students will see of one question, answerable but saving nothing: the same card and input as the exam page.
export function QuestionPreview({ question: q, number }: { question: Question; number: number }) {
  const assetUrls = useContext(EditorAssetUrls);
  const [answer, setAnswer] = useState<AnswerValue | undefined>(undefined);
  const problem = modelOf(q).validate?.(q) ?? null;
  let student: StudentQuestion | null = null;
  try {
    student = toStudentQuestion(q);
  } catch {
    student = null;
  }
  if (!student)
    return <p className="rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted">Finish the question to preview it.</p>;
  return (
    <div className="space-y-2">
      <Card className="p-4">
        <div className="mb-3 flex items-start gap-3">
          <span className="grid size-7 shrink-0 place-items-center rounded-md bg-surface-muted text-sm font-semibold tabular-nums">{number}</span>
          <div className="min-w-0 flex-1">
            {student.type !== "blank" && (
              <Markdown className="font-medium" assetUrls={assetUrls}>
                {student.prompt}
              </Markdown>
            )}
            <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
              <QuestionTypeBadge type={student.type} mode={student.type === "blank" ? student.mode : undefined} />
              {pointsLabel(student.points)}
            </p>
          </div>
        </div>
        <AnswerInput q={student} value={answer} onChange={setAnswer} assetUrls={assetUrls} uploads={false} registerDrawing={noop} />
      </Card>
      <p className="px-1 text-xs text-muted">
        {problem ? `Students can't take it yet: the question ${problem}` : "Answers typed here aren't saved. Choices and blanks appear as this student would get them."}
      </p>
    </div>
  );
}
