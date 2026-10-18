import Link from "next/link";
import { Pencil } from "lucide-react";
import type { QuizListItem } from "@examinus/contract/quiz";
import type { Session } from "@examinus/domain/quiz";
import { ButtonLink } from "@/components/ui";
import { ModeBadge, SessionStatusPill } from "@/features/session/components/assessment-bits";
import { formatDateTime, formatRelative } from "@/lib/format";
import { SortableHeader, type SortDir, type SortState } from "@/components/sort-link-header";

export type QuizSortKey = "title" | "subject" | "questions" | "mode" | "status" | "sessions" | "last" | "updated";
export type QuizRow = { item: QuizListItem; lead: Session | null };

type ClassLabel = Record<string, { courseCode: string; section: string }>;

const columns: { key: QuizSortKey; label: string; naturalDir: SortDir; className?: string }[] = [
  { key: "title", label: "Title", naturalDir: "asc" },
  { key: "subject", label: "Subject / class", naturalDir: "asc" },
  { key: "questions", label: "Questions", naturalDir: "desc", className: "text-right" },
  { key: "mode", label: "Mode", naturalDir: "asc" },
  { key: "status", label: "Status", naturalDir: "asc" },
  { key: "sessions", label: "Sessions", naturalDir: "desc", className: "text-right" },
  { key: "last", label: "Last / next session", naturalDir: "desc" },
  { key: "updated", label: "Updated", naturalDir: "desc" },
];

// The date that matters for a quiz: when its upcoming session opens, else when the headline session last ran.
export function sessionDate(lead: Session | null): string | null {
  if (!lead) return null;
  return lead.status === "scheduled" ? lead.opensAt : (lead.endedAt ?? lead.startedAt ?? lead.opensAt);
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
    <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
      <table className="w-full min-w-[60rem] border-collapse text-sm">
        <caption className="sr-only">Quizzes and exams, sortable by column</caption>
        <thead className="bg-surface-muted text-xs tracking-wide text-muted uppercase">
          <tr>
            {columns.map((c) => (
              <SortableHeader key={c.key} label={c.label} sortKey={c.key} naturalDir={c.naturalDir} current={sort} href={sortHref} className={c.className} />
            ))}
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map(({ item, lead }) => {
            const { quiz, questionCount, sessions } = item;
            const base = `/teacher/assessments/${quiz.id}`;
            const c = lead?.classId ? classById[lead.classId] : undefined;
            const date = sessionDate(lead);
            return (
              <tr key={quiz.id} className="hover:bg-surface-muted/40">
                <td className="max-w-xs px-3 py-2.5 font-medium">
                  <Link href={base} className="line-clamp-2 hover:text-primary">
                    {quiz.title}
                  </Link>
                </td>
                <td className="px-3 py-2.5">
                  <span className="block truncate text-primary">{quiz.subject || <span className="text-muted">—</span>}</span>
                  {lead && <span className="block truncate text-xs text-muted">{c ? `${c.courseCode} ${c.section}` : "Anyone with the key"}</span>}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{questionCount}</td>
                <td className="px-3 py-2.5">{lead ? <ModeBadge mode={lead.mode} /> : <span className="text-muted">—</span>}</td>
                <td className="px-3 py-2.5">
                  {lead ? (
                    <SessionStatusPill session={lead} />
                  ) : (
                    <span className="inline-flex items-center rounded-full border border-dashed border-border px-2.5 py-0.5 text-xs font-semibold text-muted">Draft</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{sessions.length}</td>
                <td className="px-3 py-2.5 whitespace-nowrap text-muted">{date ? formatDateTime(date) : "—"}</td>
                <td className="px-3 py-2.5 whitespace-nowrap text-muted">{formatRelative(quiz.updatedAt)}</td>
                <td className="px-3 py-2.5 text-right whitespace-nowrap">
                  <ButtonLink href={`${base}/edit`} variant="ghost" className="-my-1 px-2.5 py-1">
                    <Pencil className="size-3.5" aria-hidden /> Edit
                  </ButtonLink>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
