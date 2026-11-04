import Link from "next/link";
import clsx from "clsx";
import { ClipboardList, FilePen, Gamepad2, Pencil, Plus, Radio, ShieldCheck, Target, type LucideIcon } from "lucide-react";
import type { QuizListItem } from "@examinus/contract/quiz";
import type { Session, SessionMode } from "@examinus/domain/quiz";
import { modeLabel } from "@examinus/copy/modes";
import { ButtonLink } from "@/components/ui";
import { SessionStatusPill } from "@/features/session/components/assessment-bits";
import { formatDateTime, formatRelative } from "@/lib/format";
import { SortableHeader, type SortDir, type SortState } from "@/components/sort-link-header";
import { QuizRowMenu } from "./quiz-row-menu";

export type QuizSortKey = "title" | "subject" | "questions" | "sessions" | "status" | "updated";
export type QuizRow = { item: QuizListItem; lead: Session | null };

type ClassLabel = Record<string, { courseCode: string; section: string }>;

// Narrow screens keep the quiz, its status and the actions; the rest fold into the quiz cell's second line.
const columns: { key: QuizSortKey; label: string; naturalDir: SortDir; className?: string }[] = [
  { key: "title", label: "Quiz", naturalDir: "asc" },
  { key: "subject", label: "Subject / class", naturalDir: "asc", className: "hidden md:table-cell" },
  { key: "questions", label: "Questions", naturalDir: "desc", className: "hidden text-right lg:table-cell" },
  { key: "sessions", label: "Sessions", naturalDir: "desc", className: "hidden text-right lg:table-cell" },
  { key: "status", label: "Status", naturalDir: "asc" },
  { key: "updated", label: "Updated", naturalDir: "desc", className: "hidden xl:table-cell" },
];

// The tile before each title: the headline session's mode, or a draft. Colour backs up the label, never replaces it.
const modeTile: Record<SessionMode | "draft", { icon: LucideIcon; className: string }> = {
  quiz: { icon: ClipboardList, className: "bg-primary-soft text-primary" },
  exam: { icon: ShieldCheck, className: "bg-danger-soft text-danger" },
  mastery: { icon: Target, className: "bg-success-soft text-success" },
  game: { icon: Gamepad2, className: "bg-warning-soft text-warning" },
  draft: { icon: FilePen, className: "bg-surface-muted text-muted" },
};

// What the status cell says under the pill: when the upcoming session opens, else when the headline one last ran.
function statusNote(lead: Session | null): string {
  if (!lead) return "Not run yet";
  if (lead.status === "scheduled") return `Opens ${formatDateTime(lead.opensAt)}`;
  if (lead.status === "running" || lead.status === "lobby") return lead.startedAt ? `Started ${formatRelative(lead.startedAt)}` : "Open now";
  return `Ran ${formatDateTime(lead.endedAt ?? lead.startedAt ?? lead.opensAt)}`;
}

export function QuizTable({
  rows,
  classById,
  sort,
  sortHref,
}: {
  rows: readonly QuizRow[];
  classById: ClassLabel;
  sort: SortState<QuizSortKey>;
  sortHref: (next: SortState<QuizSortKey>) => string;
}) {
  return (
    // No scroll wrapper: narrow screens drop columns instead (see `columns`), and the row menu must not be clipped.
    <table className="w-full border-collapse text-sm">
      <caption className="sr-only">Quizzes and exams, sortable by column</caption>
      <thead className="border-b border-border bg-surface-muted/60 text-xs tracking-wide text-muted uppercase">
        <tr>
          {columns.map((c) => (
            <SortableHeader key={c.key} label={c.label} sortKey={c.key} naturalDir={c.naturalDir} current={sort} href={sortHref} className={c.className} />
          ))}
          <th scope="col" className="px-3 py-2 text-right font-medium">
            <span className="sr-only">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {rows.map(({ item, lead }) => {
          const { quiz, questionCount, totalPoints, sessions } = item;
          const base = `/teacher/assessments/${quiz.id}`;
          const c = lead?.classId ? classById[lead.classId] : undefined;
          const classLabel = lead ? (c ? `${c.courseCode} ${c.section}` : "Anyone with the key") : null;
          const tile = modeTile[lead?.mode ?? "draft"];
          const Icon = tile.icon;
          const live = lead?.status === "running" || lead?.status === "lobby" ? lead : null;
          return (
            // The title's link covers the whole row (after:inset-0); the actions sit above it.
            <tr key={quiz.id} className="group relative transition-colors hover:bg-primary-soft/40 has-focus-visible:bg-primary-soft/40">
              <td className="py-3 pr-3 pl-4">
                <div className="flex min-w-[10rem] items-center gap-3">
                  <span className={clsx("grid size-10 shrink-0 place-items-center rounded-xl", tile.className)} aria-hidden>
                    <Icon className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <Link
                      href={base}
                      className="line-clamp-2 font-semibold outline-none after:absolute after:inset-0 group-hover:text-primary focus-visible:underline"
                    >
                      {quiz.title}
                    </Link>
                    <p className="mt-0.5 flex flex-wrap gap-x-1.5 text-xs text-muted">
                      <span>{lead ? modeLabel(lead.mode) : "Draft"}</span>
                      <span aria-hidden>·</span>
                      <span>{questionCount === 0 ? "No questions yet" : `${questionCount} ${questionCount === 1 ? "question" : "questions"} · ${totalPoints} pts`}</span>
                      {/* Shown here only where the Subject column is hidden. */}
                      {quiz.subject && <span className="md:hidden">· {quiz.subject}</span>}
                    </p>
                  </div>
                </div>
              </td>
              <td className="hidden px-3 py-3 md:table-cell">
                {quiz.subject ? <span className="block max-w-[12rem] truncate font-medium">{quiz.subject}</span> : <span className="text-muted">General</span>}
                {classLabel && <span className="block max-w-[12rem] truncate text-xs text-muted">{classLabel}</span>}
              </td>
              <td className="hidden px-3 py-3 text-right tabular-nums lg:table-cell">{questionCount}</td>
              <td className="hidden px-3 py-3 text-right tabular-nums lg:table-cell">{sessions.length}</td>
              <td className="px-3 py-3">
                {lead ? (
                  <SessionStatusPill session={lead} />
                ) : (
                  <span className="inline-flex items-center rounded-full border border-dashed border-border px-2.5 py-0.5 text-xs font-semibold text-muted">Draft</span>
                )}
                <span className="mt-1 block text-xs whitespace-nowrap text-muted">{statusNote(lead)}</span>
              </td>
              <td className="hidden px-3 py-3 whitespace-nowrap text-muted xl:table-cell">{formatRelative(quiz.updatedAt)}</td>
              <td className="py-3 pr-4 pl-3">
                <div className="relative z-10 flex items-center justify-end gap-1">
                  {live && (
                    <ButtonLink href={live.mode === "game" ? `${base}/sessions/${live.id}/present` : `${base}/sessions/${live.id}/live`} className="px-3 py-1.5 text-xs">
                      <Radio className="size-3.5" aria-hidden /> Resume
                    </ButtonLink>
                  )}
                  {/* Phones keep the row link and the menu (which has Edit); the labelled button needs the room. */}
                  <span className="hidden sm:block">
                    {questionCount === 0 ? (
                      <ButtonLink href={`${base}/edit`} variant="ghost" className="px-2.5 py-1.5 text-xs text-primary">
                        <Plus className="size-3.5" aria-hidden /> Add items
                      </ButtonLink>
                    ) : (
                      <ButtonLink href={`${base}/edit`} variant="ghost" className="px-2.5 py-1.5 text-xs">
                        <Pencil className="size-3.5" aria-hidden /> Edit
                      </ButtonLink>
                    )}
                  </span>
                  <QuizRowMenu quizId={quiz.id} title={quiz.title} sessionCount={sessions.length} />
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
