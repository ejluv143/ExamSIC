import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CalendarClock, ShieldAlert } from "lucide-react";
import { Card } from "@/components/ui";
import { DeviceApproval, UseComputer } from "@/components/exam-gate";
import { getPaperToTake } from "@/lib/data/student";
import { hasAttemptsLeft } from "@/lib/attempts";
import { formatDateTime } from "@/lib/format";
import { availability } from "@/lib/sessions";
import { StudentExam } from "./student-exam";

export async function generateMetadata(props: PageProps<"/student/assessments/[sessionId]">): Promise<Metadata> {
  const { sessionId } = await props.params;
  const data = await getPaperToTake(sessionId);
  return { title: data?.paper?.quiz.title ?? "Quiz or exam" };
}

export default async function TakeAssessmentPage(props: PageProps<"/student/assessments/[sessionId]">) {
  const { sessionId } = await props.params;
  const data = await getPaperToTake(sessionId);
  if (!data) notFound();
  if ("waiting" in data) return <DeviceApproval sessionId={sessionId} />;
  if ("blocked" in data)
    return data.computersOnly ? (
      <UseComputer message={data.blocked} />
    ) : (
      <Card role="alert" className="mx-auto max-w-lg p-8 text-center">
        <ShieldAlert className="mx-auto size-8 text-danger" aria-hidden />
        <h1 className="mt-3 text-lg font-semibold">You can&apos;t take this here</h1>
        <p className="mt-1 text-sm text-muted">{data.blocked}</p>
      </Card>
    );
  const { paper } = data;
  // A game has its own screen.
  if (paper.session.mode === "game") redirect(`/student/game/${paper.session.id}`);
  const { session } = paper;
  const when = availability(session.status);

  // Over, or every attempt used (an attempt in progress counts as used, but can be continued).
  if (when === "closed" || (!paper.attempt && !hasAttemptsLeft(paper.attemptsUsed, session.attemptsAllowed))) {
    redirect(`/student/assessments/${session.id}/result`);
  }

  return (
    <>
      <Link href="/student/assessments" className="mb-4 inline-block text-sm text-muted hover:text-foreground">
        ← Quizzes & exams
      </Link>
      {when === "upcoming" ? (
        <Card className="mx-auto max-w-lg p-8 text-center">
          <CalendarClock className="mx-auto size-8 text-info" aria-hidden />
          <h1 className="mt-3 text-lg font-semibold">{paper.quiz.title}</h1>
          <p className="mt-1 text-sm text-muted">
            {session.opensAt ? `Opens ${formatDateTime(session.opensAt)}. Come back then.` : "Not open yet. Come back later."}
          </p>
        </Card>
      ) : (
        <StudentExam
          paper={paper}
          classes={data.classes}
          watermark={data.watermark}
          student={{ name: data.studentName, number: data.studentNumber }}
        />
      )}
    </>
  );
}
