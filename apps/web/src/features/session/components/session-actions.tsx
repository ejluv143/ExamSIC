"use client";

import { useState, useTransition } from "react";
import { lifecycleControls } from "@examinus/domain/lifecycle";
import type { Session } from "@examinus/domain/quiz";
import { Button } from "@/components/ui";
import { endSessionAction, openLobbyAction, releaseResultsAction, startSessionAction } from "../actions";

// Start now, End, and the manual release of scores to students.
export function SessionActions({
  session,
}: {
  session: Pick<Session, "id" | "status" | "mode" | "resultsRelease" | "resultsReleased">;
}) {
  const sessionId = session.id;
  const controls = lifecycleControls(session);
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
      {controls.openLobby && (
        <Button disabled={pending} onClick={() => run(() => openLobbyAction(sessionId))}>
          Open lobby
        </Button>
      )}
      {controls.start && (
        <Button disabled={pending} onClick={() => run(() => startSessionAction(sessionId))}>
          Start now
        </Button>
      )}
      {controls.end && (
        <Button variant="secondary" disabled={pending} onClick={() => run(() => endSessionAction(sessionId))}>
          End now
        </Button>
      )}
      {controls.release && (
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() => run(() => releaseResultsAction(sessionId, !session.resultsReleased))}
        >
          {session.resultsReleased ? "Hide results from students" : "Release results"}
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
