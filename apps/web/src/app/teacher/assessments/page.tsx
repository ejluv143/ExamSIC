import type { Metadata } from "next";
import Link from "next/link";
import { Card, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui";
import { NewQuizButton } from "./_editor/new-quiz-button";
import { getClasses, listQuizzes } from "@/lib/data/teacher";

export const metadata: Metadata = { title: "Quizzes & exams" };


export default async function QuizzesPage(props: PageProps<"/teacher/assessments">) {
  const { new: openNew, class: classId } = await props.searchParams;

  const [quizzes, classes] = await Promise.all([listQuizzes(), getClasses()]);
  const classById = Object.fromEntries(classes.map((c) => [c.id, c]));

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

      <Card>
        {quizzes.length === 0 ? (
          <EmptyState title="Nothing here yet" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Title</Th>
                <Th className="hidden md:table-cell">Class</Th>
                <Th className="text-right">Sessions</Th>
                <Th className="text-right">Items</Th>
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
                    <Td className="hidden text-muted md:table-cell">
                      {c ? `${c.courseCode} ${c.section}` : "—"}
                    </Td>
                    <Td className="text-right tabular-nums">{sessions.length}</Td>
                    <Td className="text-right tabular-nums">
                      {questionCount}
                      <span className="text-muted"> · {totalPoints} pts</span>
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
