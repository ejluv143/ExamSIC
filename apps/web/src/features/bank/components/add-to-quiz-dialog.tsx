"use client";

import { useEffect, useState } from "react";
import type { BankQuestion } from "@examinus/contract/bank";
import { Dialog } from "@/components/dialog";
import { Select } from "@/components/select";
import { Button, ButtonLink } from "@/components/ui";
import { addToQuizAction, listDraftQuizzesAction } from "@/features/bank/actions";

type Draft = { id: string; title: string; questionCount: number };

// Appends the picked questions to one of the teacher's draft quizzes (the end of its last part).
export function AddToQuizDialog({ items, onClose }: { items: readonly BankQuestion[] | null; onClose: () => void }) {
  return (
    <Dialog
      open={items !== null}
      onClose={onClose}
      title="Add to quiz"
      description={items ? `Add ${items.length} question${items.length === 1 ? "" : "s"} to the end of a draft quiz. The quiz gets its own copies.` : undefined}
    >
      {items && <AddForm items={items} onClose={onClose} />}
    </Dialog>
  );
}

function AddForm({ items, onClose }: { items: readonly BankQuestion[]; onClose: () => void }) {
  const [drafts, setDrafts] = useState<readonly Draft[] | null>(null);
  const [quizId, setQuizId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<{ quizId: string; count: number } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    listDraftQuizzesAction().then(
      (list) => {
        if (!live) return;
        setDrafts(list);
        setQuizId(list[0]?.id ?? "");
      },
      () => live && setDrafts([]),
    );
    return () => {
      live = false;
    };
  }, []);

  async function add() {
    setBusy(true);
    setError(null);
    const result = await addToQuizAction(quizId, items.map((b) => b.question.id));
    setBusy(false);
    if ("error" in result) setError(result.error);
    else setAdded(result.ok);
  }

  if (added)
    return (
      <div className="space-y-4">
        <p role="status" className="rounded-lg bg-success-soft p-3 text-sm text-success">
          Added {added.count} question{added.count === 1 ? "" : "s"} to the quiz.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <ButtonLink href={`/teacher/assessments/${added.quizId}/edit`}>Open the quiz</ButtonLink>
        </div>
      </div>
    );

  return (
    <div className="space-y-4" aria-busy={busy || drafts === null}>
      {error && (
        <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm text-danger">
          {error}
        </p>
      )}
      {drafts === null ? (
        <p className="text-sm text-muted">Loading your drafts…</p>
      ) : drafts.length === 0 ? (
        <p className="text-sm text-muted">You have no draft quizzes. Create a quiz first, or add these from the quiz editor&apos;s question bank.</p>
      ) : (
        <div>
          <p className="mb-1.5 text-sm font-medium" id="draft-quiz-label">
            Draft quiz
          </p>
          <Select
            value={quizId}
            onChange={setQuizId}
            className="w-full"
            aria-labelledby="draft-quiz-label"
            options={drafts.map((d) => ({ value: d.id, label: d.title, description: `${d.questionCount} questions` }))}
          />
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={add} disabled={busy || !quizId}>
          Add questions
        </Button>
      </div>
    </div>
  );
}
