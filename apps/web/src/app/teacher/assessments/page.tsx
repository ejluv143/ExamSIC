import type { Metadata } from "next";
import Link from "next/link";
import clsx from "clsx";
import { CalendarClock, ClipboardList, FileQuestion, LayoutGrid, Pencil, Search, Table2 } from "lucide-react";
import type { QuizListItem } from "@examinus/contract/quiz";
import type { Session } from "@examinus/domain/quiz";
import { Button, ButtonLink, Card, EmptyState, inputClass, segmentClass, segmentGroupClass } from "@/components/ui";
import { LiveDot, SessionStatusPill } from "@/features/session/components/assessment-bits";
import { NewQuizButton } from "@/features/quiz/components/new-quiz-button";
import { getClasses } from "@/features/classes/data";
import { listQuizzes } from "@/features/quiz/data";
import { formatDateTime, formatRelative } from "@/lib/format";
import { QuizTable, sessionDate, type QuizRow, type QuizSortKey } from "@/features/quiz/components/quiz-table";
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

const sortKeys: QuizSortKey[] = ["title", "subject", "questions", "mode", "status", "sessions", "last", "updated"];
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
      case "mode":
        return text(r.lead?.mode ?? "~", other.lead?.mode ?? "~");
      case "status":
        return statusRank[filterOf(r.item.sessions)] - statusRank[filterOf(other.item.sessions)];
      case "sessions":
        return r.item.sessions.length - other.item.sessions.length;
      case "last":
        return (sessionDate(r.lead) ?? "").localeCompare(sessionDate(other.lead) ?? "");
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
  const view = one(params.view) === "table" ? "table" : "cards";

  // Every link keeps the search, the status and the view; the sort only matters in the table.
  const url = (over: { status?: Filter | null; view?: "cards" | "table"; sort?: SortState<QuizSortKey> }) => {
    const nextStatus = over.status === undefined ? status : over.status;
    const nextView = over.view ?? view;
    const sp = new URLSearchParams();
    if (nextStatus) sp.set("status", nextStatus);
    if (q) sp.set("q", q);
    if (nextView === "table") {
      sp.set("view", "table");
      const s = over.sort ?? (sortParam ? sort : undefined);
      if (s) {
        sp.set("sort", s.key);
        sp.set("dir", s.dir);
      }
    }
    const qs = sp.toString();
    return qs ? `/teacher/assessments?${qs}` : "/teacher/assessments";
  };
  const href = (next: Filter | undefined) => url({ status: next ?? null });
  const questionTotal = quizzes.reduce((n, i) => n + i.questionCount, 0);

  return (
    <>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Quizzes &amp; exams</h1>
          <p className="mt-1 text-sm text-muted">
            {quizzes.length > 0
              ? `${quizzes.length} ${quizzes.length === 1 ? "quiz" : "quizzes"} · ${questionTotal} ${questionTotal === 1 ? "question" : "questions"}`
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
        <>
          <div className="mb-6 flex flex-wrap items-center gap-2">
            <nav aria-label="Status" className={segmentGroupClass}>
              <Link href={href(undefined)} className={segmentClass(!status)} aria-current={!status ? "page" : undefined}>
                All <span className="tabular-nums opacity-70">{searched.length}</span>
              </Link>
              {filters.map((f) => (
                <Link key={f.key} href={href(f.key)} className={segmentClass(status === f.key)} aria-current={status === f.key ? "page" : undefined}>
                  {f.key === "live" && counts.live > 0 && <LiveDot />}
                  {f.label}
                  <span className="tabular-nums opacity-70">{counts[f.key]}</span>
                </Link>
              ))}
            </nav>
            <nav aria-label="View" className={segmentGroupClass}>
              <Link href={url({ view: "cards" })} className={segmentClass(view === "cards")} aria-current={view === "cards" ? "page" : undefined}>
                <LayoutGrid className="size-4" aria-hidden /> Cards
              </Link>
              <Link href={url({ view: "table" })} className={segmentClass(view === "table")} aria-current={view === "table" ? "page" : undefined}>
                <Table2 className="size-4" aria-hidden /> Table
              </Link>
            </nav>
            <form action="/teacher/assessments" role="search" className="flex w-full gap-2 sm:ml-auto sm:w-80">
              {status && <input type="hidden" name="status" value={status} />}
              {view === "table" && <input type="hidden" name="view" value="table" />}
              {view === "table" && sortParam && <input type="hidden" name="sort" value={sort.key} />}
              {view === "table" && sortParam && <input type="hidden" name="dir" value={sort.dir} />}
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
            <Card className="border-dashed">
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
            </Card>
          ) : (
            view === "table" ? (
              <QuizTable rows={items} classById={classById} sort={sort} sortHref={(next) => url({ sort: next })} />
            ) : (
              <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {items.map(({ item }) => (
                  <QuizCard key={item.quiz.id} item={item} classById={classById} />
                ))}
              </ul>
            )
          )}
        </>
      )}
    </>
  );
}

function QuizCard({ item, classById }: { item: QuizListItem; classById: Record<string, { courseCode: string; section: string }> }) {
  const { quiz, questionCount, totalPoints, sessions } = item;
  const lead = headline(sessions);
  const c = lead?.classId ? classById[lead.classId] : undefined;
  const base = `/teacher/assessments/${quiz.id}`;

  return (
    // The title's link covers the whole card (after:inset-0); the Edit button sits above it.
    <li className="group relative flex flex-col rounded-xl border border-border bg-surface shadow-sm transition hover:-translate-y-0.5 hover:border-primary hover:shadow-md has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-primary motion-reduce:hover:translate-y-0">
      <div className="flex items-center justify-between gap-2 px-5 pt-4">
        {lead ? (
          <SessionStatusPill session={lead} />
        ) : (
          <span className="inline-flex items-center rounded-full border border-dashed border-border px-2.5 py-0.5 text-xs font-semibold text-muted">Draft</span>
        )}
        {quiz.subject && <span className="truncate text-xs font-semibold tracking-wide text-primary">{quiz.subject}</span>}
      </div>

      <div className="px-5 pt-2">
        <h2 className="line-clamp-2 text-base leading-snug font-semibold">
          <Link href={base} className="outline-none after:absolute after:inset-0 after:rounded-xl group-hover:text-primary">
            {quiz.title}
          </Link>
        </h2>
        <p className="mt-1 text-xs text-muted">Edited {formatRelative(quiz.updatedAt)}</p>
      </div>

      <dl className="mt-4 grid grid-cols-3 divide-x divide-border px-5 text-center">
        <div className="pr-3">
          <dt className="text-xs text-muted">Questions</dt>
          <dd className="text-lg font-semibold tabular-nums">{questionCount}</dd>
        </div>
        <div className="px-3">
          <dt className="text-xs text-muted">Points</dt>
          <dd className="text-lg font-semibold tabular-nums">{totalPoints}</dd>
        </div>
        <div className="pl-3">
          <dt className="text-xs text-muted">Sessions</dt>
          <dd className="text-lg font-semibold tabular-nums">{sessions.length}</dd>
        </div>
      </dl>

      <div className="min-h-4 flex-1" aria-hidden />
      <div className="flex items-center gap-3 border-t border-border bg-surface-muted/40 px-5 py-3 text-sm text-muted">
        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          {lead ? (
            <>
              <CalendarClock className="size-4 shrink-0" aria-hidden />
              <span className="truncate">
                {c ? `${c.courseCode} ${c.section}` : "Anyone with the key"}
                {lead.opensAt && ` · ${formatDateTime(lead.opensAt)}`}
              </span>
            </>
          ) : (
            <>
              <FileQuestion className="size-4 shrink-0" aria-hidden />
              <span className="truncate">{questionCount === 0 ? "No questions yet" : "Never run"}</span>
            </>
          )}
        </span>
        <ButtonLink href={`${base}/edit`} variant="ghost" className="relative z-10 -my-1 px-2.5 py-1">
          <Pencil className="size-3.5" aria-hidden /> Edit
        </ButtonLink>
      </div>
    </li>
  );
}
