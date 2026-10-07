import type { Metadata } from "next";
import { notFound } from "next/navigation";
import clsx from "clsx";
import { Badge, Card, PageHeader } from "@/components/ui";
import { answerText, quizQuestions } from "@/lib/attempt-view";
import { getAttempts, getSession, getStudents } from "@/lib/data/teacher";
import { fullName } from "@/lib/format";
import { matchingLines, similarPairs, sourceKind } from "@/lib/similarity";

export const metadata: Metadata = { title: "Compare answers" };

// Two students' answers to one code question side by side, with lines that match (after renaming) highlighted.
export default async function ComparePage(
  props: PageProps<"/teacher/assessments/[quizId]/sessions/[sessionId]/integrity/compare">,
) {
  const { quizId, sessionId } = await props.params;
  const { q: questionId, a: attemptA, b: attemptB } = await props.searchParams;
  const detail = await getSession(sessionId);
  if (!detail || detail.session.quizId !== quizId) notFound();
  const questions = quizQuestions(detail.quiz);
  const q = questions.find((x) => x.id === questionId);
  if (q?.type !== "code") notFound();

  const attempts = await getAttempts(sessionId);
  const pair = [attemptA, attemptB].map((id) => attempts.find((d) => d.attempt.id === id));
  if (!pair[0] || !pair[1]) notFound();
  const students = await getStudents(pair.map((d) => d!.studentId));
  const texts = pair.map((d) => answerText(d!, q.id));
  const kind = sourceKind(q.language);
  const score = similarPairs(
    texts.map((text, i) => ({ id: String(i), text })),
    q.starterCode,
    kind,
    0,
  )[0]?.score;

  return (
    <>
      <PageHeader
        back={{ href: `/teacher/assessments/${quizId}/sessions/${sessionId}/integrity`, label: "Anti-cheating" }}
        title="Compare answers"
        description={
          <span className="flex flex-wrap items-center gap-2">
            Question {questions.indexOf(q) + 1}
            {score !== undefined && (
              <Badge tone={score >= 0.85 ? "danger" : "warning"}>{Math.round(score * 100)}% similar</Badge>
            )}
            Highlighted lines match the other answer once names, numbers and spacing are ignored.
          </span>
        }
      />
      <div className="grid gap-4 lg:grid-cols-2">
        {pair.map((sub, i) => {
          const student = students.find((s) => s.id === sub!.studentId);
          const same = matchingLines(texts[i], texts[1 - i], q.starterCode, kind);
          const lines = texts[i].split("\n");
          return (
            <Card key={sub!.attempt.id} className="min-w-0 overflow-hidden">
              <div className="border-b border-border px-4 py-3">
                <p className="font-medium">{student ? fullName(student) : "Unknown student"}</p>
                <p className="font-mono text-xs text-muted">
                  {student?.studentNumber} · {same.size} of {lines.filter((l) => l.trim()).length} lines match
                </p>
              </div>
              <pre className="overflow-x-auto py-2 font-mono text-xs leading-relaxed">
                {lines.map((line, n) => (
                  <div key={n} className={clsx("flex", same.has(n) && "bg-danger-soft")}>
                    <span className="w-10 shrink-0 pr-3 text-right text-muted select-none">{n + 1}</span>
                    <code className="pr-4">{line || " "}</code>
                  </div>
                ))}
              </pre>
            </Card>
          );
        })}
      </div>
    </>
  );
}
