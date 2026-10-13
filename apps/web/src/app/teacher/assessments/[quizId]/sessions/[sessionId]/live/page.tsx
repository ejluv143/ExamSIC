import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { quizQuestions } from "@/features/session/attempt-view";
import { getClass, getStudents } from "@/features/classes/data";
import { getSession } from "@/features/session/data";
import { fullName } from "@/lib/format";
import { LiveView } from "@/features/live/components/live-view";

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
