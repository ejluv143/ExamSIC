"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui";
import { guessSubjectArea } from "@/lib/subjects";
import type { Class } from "@/lib/types";
import { createQuizAction } from "../actions";
import { QuizDetailsDialog, type QuizDetails } from "./quiz-details-dialog";

// "New quiz": opens the details dialog, and on Create opens the editor of the quiz it made. `startOpen` is for
// someone who arrived at /teacher/assessments/new, which lands on the list with the dialog already showing.
export function NewQuizButton({
  classes,
  classId,
  startOpen = false,
}: {
  classes: Class[];
  // The class the quiz is started from: its subject comes along.
  classId?: string;
  startOpen?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(startOpen);
  const fromClass = classes.find((c) => c.id === classId);
  const initial: QuizDetails = {
    title: "",
    description: "",
    ...(fromClass ? { subject: fromClass.courseCode } : {}),
    subjectArea: fromClass ? (fromClass.subjectArea ?? guessSubjectArea(fromClass.courseCode, fromClass.title)) : "general",
  };

  function close() {
    setOpen(false);
    // Drop ?new=1, so a reload doesn't open the dialog again.
    if (startOpen) router.replace(pathname);
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} aria-haspopup="dialog">
        <Plus className="size-4" aria-hidden /> New quiz
      </Button>
      <QuizDetailsDialog
        open={open}
        onClose={close}
        classes={classes}
        initial={initial}
        withParts
        title="New quiz"
        submitLabel="Create quiz"
        onSubmit={async (details, parts) => {
          // On success the action redirects to the new quiz's editor.
          const result = await createQuizAction({
            title: details.title,
            description: details.description,
            subject: details.subject,
            subjectArea: details.subjectArea,
            parts,
          });
          // (The form stays busy until the editor takes over.)
          if (result && "error" in result) return result.error;
        }}
      />
    </>
  );
}
