"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { endSessionAction, releaseResultsAction, startSessionAction } from "../../../actions";

// Start now, End, and the manual release of scores to students.
export function SessionActions({
  sessionId,
  status,
  manualRelease,
  released,
}: {
  sessionId: string;
  status: "scheduled" | "lobby" | "running" | "ended";
  manualRelease: boolean;
  released: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(action: () => Promise<{ error: string } | object>) {
    start(async () => {
      const result = await action();
      setError("error" in result ? result.error : null);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status !== "running" && status !== "ended" && (
        <Button disabled={pending} onClick={() => run(() => startSessionAction(sessionId))}>
          Start now
        </Button>
      )}
      {status === "running" && (
        <Button variant="secondary" disabled={pending} onClick={() => run(() => endSessionAction(sessionId))}>
          End now
        </Button>
      )}
      {manualRelease && (
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() => run(() => releaseResultsAction(sessionId, !released))}
        >
          {released ? "Hide results from students" : "Release results"}
        </Button>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
