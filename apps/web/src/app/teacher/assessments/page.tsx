import type { Metadata } from "next";
import Link from "next/link";
import clsx from "clsx";
import { Card, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui";
import { NewQuizButton } from "./_editor/new-quiz-button";
import { ModeBadge, StatusBadge } from "@/components/assessment-bits";
import { getClasses, listQuizzes } from "@/lib/data/teacher";
import { formatDateTime } from "@/lib/format";
import { quizStatus } from "@/lib/sessions";
import type { QuizStatus } from "@/lib/types";

export const metadata: Metadata = { title: "Quizzes & exams" };

const tabs: { label: string; status?: QuizStatus }[] = [
  { label: "All" },
  { label: "Drafts", status: "draft" },
  { label: "Scheduled", status: "scheduled" },
  { label: "Open", status: "running" },
  { label: "Ended", status: "ended" },
];

export default async function QuizzesPage(props: PageProps<"/teacher/assessments">) {
  const { status: rawStatus, new: openNew, class: classId } = await props.searchParams;
  const filter = tabs.find((t) => t.status && t.status === rawStatus)?.status;

  const [all, classes] = await Promise.all([listQuizzes(), getClasses()]);
  const classById = Object.fromEntries(classes.map((c) => [c.id, c]));
  const quizzes = all.filter((q) => !filter || quizStatus(q.sessions) === filter);

  return (
    <>
      <PageHeader
        title="Quizzes & exams"
        actions={
          <NewQuizButton
            classes={classes}
            classId={typeof classId === "string" ? classId : undefined}
            startOpen={openNew === "1"}
          />
        }
      />

      <div className="mb-4 flex gap-1 border-b border-border">
        {tabs.map((t) => (
          <Link
            key={t.label}
            href={t.status ? `/teacher/assessments?status=${t.status}` : "/teacher/assessments"}
            className={clsx(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
              t.status === filter ? "border-primary text-primary" : "border-transparent text-muted hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>

      <Card>
        {quizzes.length === 0 ? (
          <EmptyState title="Nothing here yet" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Title</Th>
                <Th>Latest session</Th>
                <Th className="hidden md:table-cell">Class</Th>
                <Th className="hidden lg:table-cell">Window</Th>
                <Th className="hidden sm:table-cell text-right">Sessions</Th>
                <Th className="text-right">Items</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {quizzes.map(({ quiz, questionCount, totalPoints, sessions }) => {
                const latest = sessions[0];
                const c = latest?.classId ? classById[latest.classId] : undefined;
                return (
                  <tr key={quiz.id} className="hover:bg-surface-muted">
                    <Td>
                      <Link href={`/teacher/assessments/${quiz.id}`} className="font-medium hover:text-primary">
                        {quiz.title}
                      </Link>
                    </Td>
                    <Td>{latest ? <ModeBadge mode={latest.mode} /> : <span className="text-muted">—</span>}</Td>
                    <Td className="hidden text-muted md:table-cell">
                      {c ? `${c.courseCode} ${c.section}` : "—"}
                    </Td>
                    <Td className="hidden text-muted lg:table-cell">
                      {latest?.opensAt ? `${formatDateTime(latest.opensAt)} – ${formatDateTime(latest.closesAt)}` : "—"}
                    </Td>
                    <Td className="hidden text-right tabular-nums sm:table-cell">{sessions.length}</Td>
                    <Td className="text-right tabular-nums">
                      {questionCount}
                      <span className="text-muted"> · {totalPoints} pts</span>
                    </Td>
                    <Td>
                      <StatusBadge status={quizStatus(sessions)} />
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
