"use client";

import { useState, useTransition } from "react";
import { LogIn } from "lucide-react";
import { Button } from "@/components/ui";
import { allowBackInAction } from "@/lib/live/actions";

// Exam sessions: lets a held attempt continue on the new device (or after a long absence).
export function ApproveButton({ attemptId, name }: { attemptId: string; name?: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button
        disabled={pending}
        onClick={(e) => {
          e.stopPropagation();
          if (name && !window.confirm(`Approve ${name}'s device switch? They continue the exam on the new device.`)) return;
          start(async () => {
            const result = await allowBackInAction(attemptId);
            setError("error" in result ? result.error : null);
          });
        }}
      >
        <LogIn className="size-4" aria-hidden /> Approve device switch
      </Button>
      {error && (
        <span role="alert" className="text-xs text-danger">
          {error}
        </span>
      )}
    </span>
  );
}
