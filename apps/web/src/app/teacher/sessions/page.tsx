import type { Metadata } from "next";
import Link from "next/link";
import clsx from "clsx";
import { ClipboardList, Gamepad2, Repeat, Search, ShieldCheck, type LucideIcon } from "lucide-react";
import { Badge, Button, ButtonLink, Card, EmptyState, PageHeader, Table, Td, Th, inputClass } from "@/components/ui";
import { StatusBadge } from "@/components/assessment-bits";
import { getClasses, listSessions } from "@/lib/data/teacher";
import { formatDateTime } from "@/lib/format";
import { modeLabel } from "@/lib/sessions";
import type { SessionMode, SessionStatus } from "@examora/contract";
import { CopyKey } from "./copy-key";

export const metadata: Metadata = { title: "Sessions" };

const statuses: { value: SessionStatus; label: string }[] = [
  { value: "scheduled", label: "Scheduled" },
  { value: "lobby", label: "Lobby" },
  { value: "running", label: "Running" },
  { value: "ended", label: "Ended" },
];
const modes: SessionMode[] = ["quiz", "exam", "mastery", "game"];
const modeIcon: Record<SessionMode, LucideIcon> = {
  quiz: ClipboardList,
  exam: ShieldCheck,
  mastery: Repeat,
  game: Gamepad2,
};

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function SessionsPage(props: PageProps<"/teacher/sessions">) {
  const params = await props.searchParams;
  const status = statuses.find((s) => s.value === one(params.status))?.value;
  const mode = modes.find((m) => m === one(params.mode));
  const q = (one(params.q) ?? "").trim();

  const [all, classes] = await Promise.all([listSessions(), getClasses()]);
  const classById = Object.fromEntries(classes.map((c) => [c.id, c]));
  const items = all.filter(
    (i) =>
      (!status || i.session.status === status) &&
      (!mode || i.session.mode === mode) &&
      (!q || i.quizTitle.toLowerCase().includes(q.toLowerCase())),
  );

  const href = (next: { status?: string; mode?: string }) => {
    const sp = new URLSearchParams();
    const s = "status" in next ? next.status : status;
    const m = "mode" in next ? next.mode : mode;
    if (s) sp.set("status", s);
    if (m) sp.set("mode", m);
    if (q) sp.set("q", q);
    const qs = sp.toString();
    return qs ? `/teacher/sessions?${qs}` : "/teacher/sessions";
  };
  const chip = (active: boolean) =>
    clsx(
      "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium",
      active ? "border-primary bg-primary-soft text-primary" : "border-border text-muted hover:bg-surface-muted hover:text-foreground",
    );

  return (
    <>
      <PageHeader
        title="Sessions"
        description="Every time you ran a quiz, exam, mastery set or game, across all your quizzes."
      />

      <div className="mb-4 space-y-3">
        <form action="/teacher/sessions" className="flex max-w-md gap-2">
          {status && <input type="hidden" name="status" value={status} />}
          {mode && <input type="hidden" name="mode" value={mode} />}
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Search by quiz title"
              aria-label="Search by quiz title"
              className={clsx(inputClass, "pl-9")}
            />
          </div>
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </form>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Status">
            <Link href={href({ status: undefined })} className={chip(!status)}>
              All statuses
            </Link>
            {statuses.map((s) => (
              <Link key={s.value} href={href({ status: s.value })} className={chip(status === s.value)} aria-current={status === s.value ? "true" : undefined}>
                {s.label}
              </Link>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Mode">
            <Link href={href({ mode: undefined })} className={chip(!mode)}>
              All modes
            </Link>
            {modes.map((m) => {
              const Icon = modeIcon[m];
              return (
                <Link key={m} href={href({ mode: m })} className={chip(mode === m)} aria-current={mode === m ? "true" : undefined}>
                  <Icon className="size-3.5" aria-hidden /> {modeLabel(m)}
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      <Card>
        {items.length === 0 ? (
          <EmptyState title={all.length === 0 ? "No sessions yet" : "No sessions match"}>
            {all.length === 0 ? (
              <>
                Start one from a quiz.{" "}
                <Link href="/teacher/assessments" className="text-primary hover:underline">
                  Go to Quizzes & exams
                </Link>
              </>
            ) : (
              <Link href="/teacher/sessions" className="text-primary hover:underline">
                Clear filters
              </Link>
            )}
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Quiz</Th>
                <Th>Class</Th>
                <Th>Status</Th>
                <Th>Join key</Th>
                <Th>Opens / closes</Th>
                <Th className="text-right">Students</Th>
                <Th>
                  <span className="sr-only">Links</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {items.map(({ session, quizTitle, studentCount, submittedCount, needsGrading }) => {
                const c = session.classId ? classById[session.classId] : undefined;
                const base = `/teacher/assessments/${session.quizId}/sessions/${session.id}`;
                const Icon = modeIcon[session.mode];
                return (
                  <tr key={session.id} className="hover:bg-surface-muted">
                    <Td>
                      <Link href={base} className="font-medium hover:text-primary">
                        {quizTitle}
                      </Link>
                      <span className="mt-0.5 flex items-center gap-1 text-xs text-muted">
                        <Icon className="size-3.5" aria-hidden /> {modeLabel(session.mode)}
                      </span>
                    </Td>
                    <Td className="text-muted">
                      {session.classId ? (
                        c ? (
                          `${c.courseCode} ${c.section}`
                        ) : (
                          "Class"
                        )
                      ) : (
                        <Badge>Open to anyone with the key</Badge>
                      )}
                    </Td>
                    <Td>
                      <StatusBadge status={session.status} />
                    </Td>
                    <Td>{session.joinCode ? <CopyKey code={session.joinCode} /> : <span className="text-muted">—</span>}</Td>
                    <Td className="text-muted">
                      {session.opensAt ? (
                        <>
                          {formatDateTime(session.opensAt)}
                          <span className="block text-xs">
                            {session.closesAt ? `to ${formatDateTime(session.closesAt)}` : "until you end it"}
                          </span>
                        </>
                      ) : (
                        "When you start it"
                      )}
                    </Td>
                    <Td className="text-right tabular-nums">
                      {studentCount} joined
                      <span className="block text-xs text-muted">{submittedCount} submitted</span>
                      {needsGrading > 0 && <span className="block text-xs text-warning">{needsGrading} need grading</span>}
                    </Td>
                    <Td>
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {session.mode === "game" && session.status !== "ended" && (
                          <ButtonLink href={`${base}/present`} className="px-2.5 py-1">
                            Present
                          </ButtonLink>
                        )}
                        {session.mode !== "game" && (session.status === "running" || session.status === "scheduled") && (
                          <ButtonLink href={`${base}/live`} className="px-2.5 py-1">
                            Live view
                          </ButtonLink>
                        )}
                        <ButtonLink href={base} variant="secondary" className="px-2.5 py-1">
                          Results
                        </ButtonLink>
                        {needsGrading > 0 && (
                          <ButtonLink href={`/teacher/grading/${session.id}`} variant="secondary" className="px-2.5 py-1">
                            Grade
                          </ButtonLink>
                        )}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
