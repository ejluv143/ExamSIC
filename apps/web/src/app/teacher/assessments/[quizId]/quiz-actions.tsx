"use client";

import { useState } from "react";
import { Copy, Trash2 } from "lucide-react";
import { Button } from "@/components/ui";
import { duplicateQuizAction, removeQuizAction } from "../actions";

// Duplicate and Delete for the quiz. Both leave the page on success (the actions redirect).
export function QuizActions({ quizId, title, sessionCount }: { quizId: string; title: string; sessionCount: number }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: (id: string) => Promise<{ error: string } | unknown>) {
    setBusy(true);
    const result = await action(quizId);
    setBusy(false);
    if (result && typeof result === "object" && "error" in result) setError(String(result.error));
  }

  return (
    <>
      <Button variant="secondary" disabled={busy} onClick={() => run(duplicateQuizAction)}>
        <Copy className="size-4" aria-hidden /> Duplicate
      </Button>
      <Button
        variant="danger"
        disabled={busy}
        onClick={() => {
          const message =
            sessionCount > 0
              ? `Delete "${title}" with its ${sessionCount} ${sessionCount === 1 ? "session" : "sessions"} and all students' attempts? This can't be undone.`
              : `Delete "${title}"? This can't be undone.`;
          if (window.confirm(message)) run(removeQuizAction);
        }}
      >
        <Trash2 className="size-4" aria-hidden /> Delete
      </Button>
      {error && (
        <p role="alert" className="basis-full text-sm text-danger">
          {error}
        </p>
      )}
    </>
  );
}
