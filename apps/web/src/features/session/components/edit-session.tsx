"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import type { Session } from "@examinus/domain/quiz";
import { Dialog } from "@/components/dialog";
import { Button } from "@/components/ui";
import type { Class } from "@/features/classes/types";
import { sessionSecretsAction, type SessionSecrets } from "../actions";
import { SessionForm } from "./session-form";

// Opens the session's settings from where the teacher runs it (the live view, a game's presenter). The lobby is the
// last moment the rules can change; the form itself locks what a started session keeps.
export function EditSessionButton({
  quizId,
  session,
  classes,
  variant = "secondary",
  className,
}: {
  quizId: string;
  session: Session;
  classes: Class[];
  variant?: "primary" | "secondary" | "ghost";
  className?: string;
}) {
  const [secrets, setSecrets] = useState<SessionSecrets | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setLoading(true);
    const found = await sessionSecretsAction(session.id);
    setLoading(false);
    if (!found) return setError("That session no longer exists.");
    setError(null);
    setSecrets(found);
  }

  return (
    <>
      <Button variant={variant} className={className} disabled={loading} onClick={open}>
        <Pencil className="size-4" aria-hidden /> Edit session
      </Button>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <Dialog open={secrets !== null} onClose={() => setSecrets(null)} title="Edit session" size="xl" fill>
        {secrets && <SessionForm key={session.id} quizId={quizId} classes={classes} session={session} {...secrets} onDone={() => setSecrets(null)} />}
      </Dialog>
    </>
  );
}
