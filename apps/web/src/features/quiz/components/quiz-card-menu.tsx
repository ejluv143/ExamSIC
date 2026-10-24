"use client";

import { useState, useTransition } from "react";
import { Copy, ExternalLink, Pencil, Trash2 } from "lucide-react";
import { Menu, type MenuItem } from "@/components/menu";
import { duplicateQuizAction, removeQuizAction } from "../actions";

// The "more" menu on a quiz card: open, edit, duplicate, delete. Duplicate and Delete redirect on success (the
// actions do); a refusal shows under the card's footer.
export function QuizCardMenu({ quizId, title, sessionCount }: { quizId: string; title: string; sessionCount: number }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const base = `/teacher/assessments/${quizId}`;

  const run = (action: (id: string) => Promise<{ error: string } | unknown>) =>
    start(async () => {
      const result = await action(quizId);
      if (result && typeof result === "object" && "error" in result) setError(String(result.error));
    });

  const items: MenuItem[] = [
    { label: "Open", icon: ExternalLink, href: base },
    { label: "Edit", icon: Pencil, href: `${base}/edit` },
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
  ];

  return (
    <>
      <Menu label={`More actions for ${title}`} items={items} />
      {error && (
        <p role="alert" className="absolute inset-x-5 bottom-1 text-xs text-danger">
          {error}
        </p>
      )}
    </>
  );
}
