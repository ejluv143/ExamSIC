"use client";

import { useState, useTransition } from "react";
import { Copy, MoreHorizontal, Trash2 } from "lucide-react";
import { Menu } from "@/components/menu";
import { duplicateQuizAction, removeQuizAction } from "../actions";

// Duplicate and Delete for the quiz, behind a "More" menu in the quiz page's header. Both leave the page on success
// (the actions redirect); a refusal shows under the header's buttons.
export function QuizActions({ quizId, title, sessionCount }: { quizId: string; title: string; sessionCount: number }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (action: (id: string) => Promise<{ error: string } | unknown>) =>
    start(async () => {
      const result = await action(quizId);
      if (result && typeof result === "object" && "error" in result) setError(String(result.error));
    });

  return (
    <>
      <Menu
        label={`More actions for ${title}`}
        trigger={<MoreHorizontal className="size-5" aria-hidden />}
        items={[
          { label: "Duplicate", icon: Copy, disabled: pending, onSelect: () => run(duplicateQuizAction) },
          {
            label: "Delete",
            icon: Trash2,
            danger: true,
            disabled: pending,
            onSelect: () => {
              const message =
                sessionCount > 0
                  ? `Delete "${title}" with its ${sessionCount} ${sessionCount === 1 ? "session" : "sessions"} and all students' attempts? This can't be undone.`
                  : `Delete "${title}"? This can't be undone.`;
              if (window.confirm(message)) run(removeQuizAction);
            },
          },
        ]}
      />
      {error && (
        <p role="alert" className="basis-full text-sm text-danger">
          {error}
        </p>
      )}
    </>
  );
}
