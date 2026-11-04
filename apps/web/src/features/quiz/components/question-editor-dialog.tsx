"use client";

import { lazy, Suspense, useEffect } from "react";
import type { Question } from "@examinus/domain/question";

export type QuestionEditorProps = {
  // The question being edited, or null while the window is closed.
  question: Question | null;
  number: number;
  // Where the question sits, e.g. "Part I · Q4".
  location: string;
  // The question is in a pool part: its points are set by the part and can't be edited here.
  poolLocked: boolean;
  onSave: (question: Question) => void;
  onClose: () => void;
};

const load = () => import("./question-editor");
const Editor = lazy(() => load().then((m) => ({ default: m.QuestionEditor })));

// The question editor window. Its code (every question type's editor, the rich text editor) is the largest part of
// the quiz editor, so it is not in the page's first load: it is fetched once the page is idle, ready for the first
// question opened, and only mounted while a question is open.
export function QuestionEditorDialog(props: QuestionEditorProps) {
  useEffect(() => {
    const idle = window.requestIdleCallback ?? ((fn: () => void) => window.setTimeout(fn, 1500));
    idle(() => void load());
  }, []);
  if (props.question === null) return null;
  return (
    <Suspense fallback={null}>
      <Editor {...props} />
    </Suspense>
  );
}
