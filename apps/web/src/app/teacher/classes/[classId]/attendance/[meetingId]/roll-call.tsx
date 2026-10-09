"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Button, Card } from "@/components/ui";
import { statusLabel } from "@/lib/attendance";
import type { AttendanceStatus } from "@/lib/types";
import { saveAttendance } from "../actions";

const choices: { status: AttendanceStatus; short: string; on: string }[] = [
  { status: "present", short: "P", on: "bg-success text-white" },
  { status: "late", short: "L", on: "bg-warning text-white" },
  { status: "absent", short: "A", on: "bg-danger text-white" },
  { status: "excused", short: "E", on: "bg-info text-white" },
];

// Everyone starts present; the teacher only taps the exceptions.
export function RollCall({
  classId,
  meetingId,
  initial,
  taken,
  students,
}: {
  classId: string;
  meetingId: string;
  initial: Record<string, AttendanceStatus>;
  taken: boolean;
  students: { id: string; name: string; sex: "M" | "F" | null }[];
}) {
  const router = useRouter();
  const [records, setRecords] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const statusOf = (id: string) => records[id] ?? "present";
  const set = (id: string, status: AttendanceStatus) =>
    setRecords((r) => {
      const next = { ...r };
      if (status === "present") delete next[id];
      else next[id] = status;
      return next;
    });

  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
  const groups = [
    { label: "Male students", list: students.filter((s) => s.sex === "M").sort(byName) },
    { label: "Female students", list: students.filter((s) => s.sex === "F").sort(byName) },
    // Imported from Google Classroom; the student gives it when they first sign in.
    ...(students.some((s) => !s.sex)
      ? [{ label: "Sex not given yet", list: students.filter((s) => !s.sex).sort(byName) }]
      : []),
  ].filter((g) => g.list.length > 0);
  const counts = Object.fromEntries(choices.map((c) => [c.status, students.filter((s) => statusOf(s.id) === c.status).length]));

  async function save() {
    setSaving(true);
    setError(null);
    const message = await saveAttendance(classId, meetingId, records);
    setSaving(false);
    if (message) setError(message);
    else router.push(`/teacher/classes/${classId}/attendance`);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {choices.map((c) => (
          <span key={c.status} className="rounded-full bg-surface-muted px-2.5 py-1">
            {statusLabel[c.status]} <span className="font-semibold tabular-nums">{counts[c.status]}</span>
          </span>
        ))}
        <Button variant="ghost" className="ml-auto px-2.5 py-1.5 text-xs" onClick={() => setRecords({})}>
          Mark everyone present
        </Button>
      </div>

      {groups.map((g) => (
        <Card key={g.label}>
          <p className="border-b border-border bg-surface-muted px-4 py-2 text-xs font-semibold tracking-wide text-muted uppercase">
            {g.label}
          </p>
          <ul className="divide-y divide-border">
            {g.list.map((s) => (
              <li key={s.id} className="flex items-center gap-3 px-4 py-2">
                <span className={clsx("min-w-0 flex-1 truncate text-sm", statusOf(s.id) !== "present" && "font-medium")}>
                  {s.name}
                </span>
                <div role="radiogroup" aria-label={`${s.name} attendance`} className="flex gap-1">
                  {choices.map((c) => {
                    const on = statusOf(s.id) === c.status;
                    return (
                      <button
                        key={c.status}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        aria-label={statusLabel[c.status]}
                        title={statusLabel[c.status]}
                        onClick={() => set(s.id, c.status)}
                        className={clsx(
                          "size-9 rounded-lg text-sm font-semibold transition-colors",
                          on ? c.on : "bg-surface-muted text-muted hover:text-foreground",
                        )}
                      >
                        {c.short}
                      </button>
                    );
                  })}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ))}

      {error && (
        <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm text-danger">
          {error}
        </p>
      )}
      <div className="sticky bottom-4 flex justify-end">
        <Button onClick={save} disabled={saving} className="shadow-lg">
          {saving ? "Saving…" : taken ? "Save changes" : "Save attendance"}
        </Button>
      </div>
    </div>
  );
}
