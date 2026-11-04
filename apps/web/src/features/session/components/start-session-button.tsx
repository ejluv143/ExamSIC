"use client";

import { useState } from "react";
import { Play } from "lucide-react";
import { Button } from "@/components/ui";
import { Dialog } from "@/components/dialog";
import type { Class } from "@/features/classes/types";
import { SessionForm } from "./session-form";

// "Start a session": opens the session form for this quiz. Used in the quiz page's header and on its Sessions tab.
export function StartSessionButton({
  quizId,
  classes,
  defaultClassId,
  variant = "primary",
}: {
  quizId: string;
  classes: Class[];
  defaultClassId?: string;
  variant?: "primary" | "secondary";
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)} aria-haspopup="dialog">
        <Play className="size-4" aria-hidden /> Start a session
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Start a session" size="xl" fill>
        <SessionForm quizId={quizId} classes={classes} defaultClassId={defaultClassId} onDone={() => setOpen(false)} />
      </Dialog>
    </>
  );
}
