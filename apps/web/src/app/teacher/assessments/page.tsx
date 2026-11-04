import type { Metadata } from "next";
import Link from "next/link";
import clsx from "clsx";
import { ClipboardList, Search, X } from "lucide-react";
import type { Session } from "@examinus/domain/quiz";
import { Button, ButtonLink, Card, EmptyState, inputClass, segmentClass, segmentGroupClass } from "@/components/ui";
import { LiveDot } from "@/features/session/components/assessment-bits";
import { NewQuizButton } from "@/features/quiz/components/new-quiz-button";
import { getClasses } from "@/features/classes/data";
import { listQuizzes } from "@/features/quiz/data";
import { QuizTable, type QuizRow, type QuizSortKey } from "@/features/quiz/components/quiz-table";
import type { SortDir, SortState } from "@/components/sort-link-header";

export const metadata: Metadata = { title: "Quizzes & exams" };

// A quiz is filtered by its liveliest session: live (running or lobby), scheduled, ended, or a draft with none.
type Filter = "live" | "scheduled" | "ended" | "draft";
const filters: { key: Filter; label: string }[] = [
  { key: "live", label: "Live" },
  { key: "scheduled", label: "Scheduled" },
  { key: "ended", label: "Ended" },
  { key: "draft", label: "Drafts" },
];

// The session that sums the quiz up (live first, then scheduled, then the newest), or null for a draft.
function headline(sessions: readonly Session[]): Session | null {
  return (
    sessions.find((s) => s.status === "running" || s.status === "lobby") ?? sessions.find((s) => s.status === "scheduled") ?? sessions[0] ?? null
  );
}

function filterOf(sessions: readonly Session[]): Filter {
  const s = headline(sessions);
  if (!s) return "draft";
  return s.status === "running" || s.status === "lobby" ? "live" : s.status === "scheduled" ? "scheduled" : "ended";
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const sortKeys: QuizSortKey[] = ["title", "subject", "questions", "sessions", "status", "updated"];
const statusRank: Record<Filter, number> = { live: 0, scheduled: 1, ended: 2, draft: 3 };

// Orders rows by the chosen column; ties fall back to the newest edit so the order is stable.
function compareRows({ key, dir }: SortState<QuizSortKey>, classById: Record<string, { courseCode: string; section: string }>) {
  const text = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });
  const value = (r: QuizRow, other: QuizRow): number => {
    switch (key) {
      case "title":
        return text(r.item.quiz.title, other.item.quiz.title);
      case "subject": {
        const label = (x: QuizRow) => `${x.item.quiz.subject ?? ""} ${x.lead?.classId && classById[x.lead.classId] ? classById[x.lead.classId]!.courseCode : ""}`.trim();
        return text(label(r), label(other));
      }
      case "questions":
        return r.item.questionCount - other.item.questionCount;
      case "sessions":
        return r.item.sessions.length - other.item.sessions.length;
      case "status":
        return statusRank[filterOf(r.item.sessions)] - statusRank[filterOf(other.item.sessions)];
      case "updated":
        return r.item.quiz.updatedAt.localeCompare(other.item.quiz.updatedAt);
    }
  };
  return (a: QuizRow, b: QuizRow) =>
    (dir === "asc" ? 1 : -1) * value(a, b) || b.item.quiz.updatedAt.localeCompare(a.item.quiz.updatedAt);
}

export default async function QuizzesPage(props: PageProps<"/teacher/assessments">) {
  const params = await props.searchParams;
  const classId = one(params.class);
  const status = filters.find((f) => f.key === one(params.status))?.key;
  const q = (one(params.q) ?? "").trim();

  const [quizzes, classes] = await Promise.all([listQuizzes(), getClasses()]);
  const classById = Object.fromEntries(classes.map((c) => [c.id, c]));

  const needle = q.toLowerCase();
  const searched = q
    ? quizzes.filter((i) => i.quiz.title.toLowerCase().includes(needle) || (i.quiz.subject ?? "").toLowerCase().includes(needle))
    : quizzes;
  const counts: Record<Filter, number> = { live: 0, scheduled: 0, ended: 0, draft: 0 };
  for (const i of searched) counts[filterOf(i.sessions)]++;
  const rows: QuizRow[] = searched
    .filter((i) => !status || filterOf(i.sessions) === status)
    .map((item) => ({ item, lead: headline(item.sessions) }));
  const sortParam = sortKeys.includes(one(params.sort) as QuizSortKey);
  const sort: SortState<QuizSortKey> = {
    key: sortParam ? (one(params.sort) as QuizSortKey) : "updated",
    dir: one(params.dir) === "asc" || one(params.dir) === "desc" ? (one(params.dir) as SortDir) : sortParam ? "asc" : "desc",
  };
  const items = rows.toSorted(compareRows(sort, classById));

  // Every link keeps the search, the status and a chosen sort.
  const url = (over: { status?: Filter | null; sort?: SortState<QuizSortKey>; q?: string }) => {
    const nextStatus = over.status === undefined ? status : over.status;
    const nextQ = over.q ?? q;
    const s = over.sort ?? (sortParam ? sort : undefined);
    const sp = new URLSearchParams();
    if (nextStatus) sp.set("status", nextStatus);
    if (nextQ) sp.set("q", nextQ);
    if (s) {
      sp.set("sort", s.key);
      sp.set("dir", s.dir);
    }
    const qs = sp.toString();
    return qs ? `/teacher/assessments?${qs}` : "/teacher/assessments";
  };
  const questionTotal = quizzes.reduce((n, i) => n + i.questionCount, 0);

  return (
    <>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Quizzes &amp; exams</h1>
          <p className="mt-1 text-sm text-muted">
            {quizzes.length > 0
              ? `${quizzes.length} ${quizzes.length === 1 ? "quiz" : "quizzes"} · ${questionTotal} ${questionTotal === 1 ? "question" : "questions"} · run each as a quiz, exam, mastery set or game`
              : "Write a quiz once, then run it as a quiz, exam, mastery set or game."}
          </p>
        </div>
        <NewQuizButton classes={classes} classId={classId} startOpen={one(params.new) === "1"} />
      </header>

      {quizzes.length === 0 ? (
        <Card className="border-dashed">
          <EmptyState icon={ClipboardList} title="No quizzes yet" action={<NewQuizButton classes={classes} classId={classId} />}>
            Create a quiz, add questions by hand, from your bank or from Excel, then start a session for a class.
          </EmptyState>
        </Card>
      ) : (
        <Card>
          <div className="flex flex-wrap items-center gap-3 border-b border-border p-3 sm:px-4">
            <nav aria-label="Status" className={segmentGroupClass}>
              <Link href={url({ status: null })} className={segmentClass(!status)} aria-current={!status ? "page" : undefined}>
                All <span className="tabular-nums opacity-70">{searched.length}</span>
              </Link>
              {filters.map((f) => (
                <Link key={f.key} href={url({ status: f.key })} className={segmentClass(status === f.key)} aria-current={status === f.key ? "page" : undefined}>
                  {f.key === "live" && counts.live > 0 && <LiveDot />}
                  {f.label}
                  <span className="tabular-nums opacity-70">{counts[f.key]}</span>
                </Link>
              ))}
            </nav>
            <form action="/teacher/assessments" role="search" className="flex w-full gap-2 sm:ml-auto sm:w-80">
              {status && <input type="hidden" name="status" value={status} />}
              {sortParam && <input type="hidden" name="sort" value={sort.key} />}
              {sortParam && <input type="hidden" name="dir" value={sort.dir} />}
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
                <input
                  type="search"
                  name="q"
                  defaultValue={q}
                  placeholder="Search titles and subjects"
                  aria-label="Search by title or subject"
                  className={clsx(inputClass, "pl-9")}
                />
              </div>
              <Button type="submit" variant="secondary">
                Search
              </Button>
            </form>
          </div>

          {items.length === 0 ? (
            <EmptyState
              icon={Search}
              title="No quizzes match"
              action={
                <ButtonLink href="/teacher/assessments" variant="secondary">
                  Clear filters
                </ButtonLink>
              }
            >
              Try another status or search.
            </EmptyState>
          ) : (
            <QuizTable rows={items} classById={classById} sort={sort} sortHref={(next) => url({ sort: next })} />
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2.5 text-xs text-muted">
            <span aria-live="polite">
              Showing {items.length} of {quizzes.length} {quizzes.length === 1 ? "quiz" : "quizzes"}
              {q && <> matching “{q}”</>}
            </span>
            {q && (
              <Link href={url({ q: "" })} className="inline-flex items-center gap-1 rounded font-semibold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary">
                <X className="size-3.5" aria-hidden /> Clear search
              </Link>
            )}
          </div>
        </Card>
      )}
    </>
  );
}
