"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { ClassroomCourse } from "@examora/contract";
import { Button, Card } from "@/components/ui";
import { importClassroomAction } from "../classroom-actions";

export function ImportForm({ courses }: { courses: readonly ClassroomCourse[] }) {
  const [state, action, pending] = useActionState(importClassroomAction, undefined);
  return (
    <form action={action} className="space-y-4">
      <Card className="divide-y divide-border">
        {courses.map((c) => (
          <label key={c.courseId} className="flex items-center gap-3 px-5 py-3">
            <input
              type="checkbox"
              name="courseId"
              value={c.courseId}
              disabled={!!c.classId}
              defaultChecked={!c.classId}
              className="size-4"
            />
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{c.name}</span>
              <span className="block text-xs text-muted">{[c.section, c.room].filter(Boolean).join(" · ") || "No section"}</span>
            </span>
            {c.classId && (
              <Link href={`/teacher/classes/${c.classId}`} className="text-xs font-medium text-primary hover:underline">
                Already imported
              </Link>
            )}
          </label>
        ))}
      </Card>
      {state?.error && (
        <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm text-danger">
          {state.error}
        </p>
      )}
      <p className="text-sm text-muted">
        Classroom has no class schedule, so add one to each imported class afterwards; attendance meetings come from it.
      </p>
      <Button type="submit" disabled={pending || courses.every((c) => c.classId)}>
        {pending ? "Importing…" : "Import selected courses"}
      </Button>
    </form>
  );
}
