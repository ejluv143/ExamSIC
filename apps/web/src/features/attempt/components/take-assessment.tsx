import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CalendarClock, ShieldAlert } from "lucide-react";
import { Card } from "@/components/ui";
import { DeviceApproval, UseComputer } from "@/features/attempt/components/exam-gate";
import { getPaperToTake } from "@/features/attempt/data";
import { hasAttemptsLeft } from "@/features/attempt/attempts";
import { formatDateTime } from "@/lib/format";
import { availability } from "@/features/session/sessions";
import { SessionLobby } from "@/features/attempt/components/session-lobby";
import { StudentExam } from "@/features/attempt/components/student-exam";
import { attemptHrefs, type PlayerArea } from "../hrefs";

// A quiz or exam as its player takes it: the lobby, the paper, or why it can't be taken now. The same for a
// student (/student/assessments) and a guest (/play); `area` decides where the links and redirects lead.
export async function TakeAssessment({ sessionId, area }: { sessionId: string; area: PlayerArea }) {
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
  const { session } = paper;
  const when = availability(session.status);
  const hrefs = attemptHrefs(area, session.id);

  // Over, or every attempt used (an attempt in progress counts as used, but can be continued).
  if (when === "closed" || (!paper.attempt && !hasAttemptsLeft(paper.attemptsUsed, session.attemptsAllowed))) {
    redirect(hrefs.result);
  }

  if (when === "lobby" && !paper.attempt)
    return <SessionLobby sessionId={session.id} title={paper.quiz.title} mode={session.mode} studentName={data.studentName} hrefs={hrefs} />;

  if (when === "upcoming")
    return (
      <>
        {hrefs.list && (
          <Link href={hrefs.list} className="mb-4 inline-block text-sm text-muted hover:text-foreground">
            ← Quizzes & exams
          </Link>
        )}
        <Card className="mx-auto max-w-lg p-8 text-center">
          <CalendarClock className="mx-auto size-8 text-info" aria-hidden />
          <h1 className="mt-3 text-lg font-semibold">{paper.quiz.title}</h1>
          <p className="mt-1 text-sm text-muted">
            {session.opensAt ? `Opens ${formatDateTime(session.opensAt)}. Come back then.` : "Not open yet. Come back later."}
          </p>
        </Card>
      </>
    );
  return (
    <StudentExam
      paper={paper}
      classes={data.classes}
      watermark={data.watermark}
      student={{ name: data.studentName, number: data.studentNumber }}
      hrefs={hrefs}
    />
  );
}
