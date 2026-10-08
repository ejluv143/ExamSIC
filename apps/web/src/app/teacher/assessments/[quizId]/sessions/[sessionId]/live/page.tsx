import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { quizQuestions } from "@/lib/attempt-view";
import { getClass, getSession, getStudents } from "@/lib/data/teacher";
import { fullName } from "@/lib/format";
import { LiveView } from "./live-view";

export const metadata: Metadata = { title: "Live view" };

export default async function LiveSessionPage(props: { params: Promise<{ quizId: string; sessionId: string }> }) {
  const { quizId, sessionId } = await props.params;
  const detail = await getSession(sessionId);
  if (!detail || detail.session.quizId !== quizId) notFound();
  const { session } = detail;
  const [cls, students] = await Promise.all([
    session.classId ? getClass(session.classId) : null,
    getStudents([...detail.studentIds]),
  ]);

  return (
    <LiveView
      quizId={quizId}
      title={detail.quiz.quiz.title}
      classLabel={cls ? `${cls.courseCode} · ${cls.section}` : null}
      initialSession={session}
      questions={quizQuestions(detail.quiz)}
      roster={students.map((s) => ({ id: s.id, name: fullName(s) }))}
    />
  );
}
