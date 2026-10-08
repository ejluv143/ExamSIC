import type { Metadata } from "next";
import { notFound } from "next/navigation";
import clsx from "clsx";
import { Badge, Card, PageHeader, Table, Td, Th } from "@/components/ui";
import { answerText, quizQuestions } from "@/lib/attempt-view";
import { getAttempts, getSession, getStudents } from "@/lib/data/teacher";
import { fullName } from "@/lib/format";
import {
  matchingLines,
  matchingPhrases,
  similarPairs,
  sourceKind,
  type AnswerValue,
  type Question,
} from "@examora/contract";

export const metadata: Metadata = { title: "Compare answers" };

// An answer as plain text, with choice ids shown as the choice's text.
function describe(q: Question, value: AnswerValue): string {
  if (value === null) return "(no answer)";
  if (typeof value === "boolean") return value ? "True" : "False";
  if (q.type === "multiple_choice") {
    const ids = typeof value === "string" ? [value] : value;
    return ids.map((id) => q.choices.find((c) => c.id === id)?.text ?? id).join(", ");
  }
  return typeof value === "string" ? value : value.join(", ");
}

// Two students' answers side by side. Code: lines that match (after renaming) are highlighted. Essays:
// matching three-word phrases. Wrong answers: the questions both got wrong in the same way.
export default async function ComparePage(
  props: PageProps<"/teacher/assessments/[quizId]/sessions/[sessionId]/integrity/compare">,
) {
  const { quizId, sessionId } = await props.params;
  const { q: questionId, a: attemptA, b: attemptB, kind: pairKind } = await props.searchParams;
  const detail = await getSession(sessionId);
  if (!detail || detail.session.quizId !== quizId) notFound();
  const questions = quizQuestions(detail.quiz);
  const q = questions.find((x) => x.id === questionId);
  const wrongAnswers = pairKind === "wrong_answers";
  if (!wrongAnswers && q?.type !== "code" && q?.type !== "essay") notFound();

  const attempts = await getAttempts(sessionId);
  const pair = [attemptA, attemptB].map((id) => attempts.find((d) => d.attempt.id === id));
  if (!pair[0] || !pair[1]) notFound();
  const students = await getStudents(pair.map((d) => d!.studentId));
  const nameOf = (i: number) => {
    const student = students.find((s) => s.id === pair[i]!.studentId);
    return student ? fullName(student) : "Unknown student";
  };
  const back = { href: `/teacher/assessments/${quizId}/sessions/${sessionId}/integrity`, label: "Anti-cheating" };

  if (wrongAnswers) {
    const shared = questions.flatMap((question) => {
      const [x, y] = pair.map((d) => d!.answers.find((a) => a.questionId === question.id));
      if (!x || !y || x.correct !== false || y.correct !== false) return [];
      const [tx, ty] = [describe(question, x.value), describe(question, y.value)];
      return tx === ty ? [{ question, text: tx }] : [];
    });
    return (
      <>
        <PageHeader
          back={back}
          title="Compare answers"
          description={`${nameOf(0)} and ${nameOf(1)} gave the same wrong answer on ${shared.length} ${shared.length === 1 ? "question" : "questions"}. Some wrong answers are common; only rare ones count as a signal.`}
        />
        <Card>
          <Table>
            <thead>
              <tr>
                <Th>Question</Th>
                <Th>{nameOf(0)}</Th>
                <Th>{nameOf(1)}</Th>
              </tr>
            </thead>
            <tbody>
              {shared.map(({ question, text }) => (
                <tr key={question.id}>
                  <Td className="tabular-nums text-muted">Q{questions.indexOf(question) + 1}</Td>
                  <Td className="bg-danger-soft whitespace-pre-wrap">{text}</Td>
                  <Td className="bg-danger-soft whitespace-pre-wrap">{text}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </>
    );
  }
  if (q?.type !== "code" && q?.type !== "essay") notFound();

  if (q.type === "essay") {
    const texts = pair.map((d) => answerText(d!, q.id));
    return (
      <>
        <PageHeader
          back={back}
          title="Compare answers"
          description={`Question ${questions.indexOf(q) + 1}. Highlighted words are in three-word phrases that both answers share.`}
        />
        <div className="grid gap-4 lg:grid-cols-2">
          {pair.map((sub, i) => {
            const same = matchingPhrases(texts[i], texts[1 - i]);
            const words = texts[i].split(/\s+/).filter(Boolean);
            return (
              <Card key={sub!.attempt.id} className="min-w-0 overflow-hidden">
                <div className="border-b border-border px-4 py-3">
                  <p className="font-medium">{nameOf(i)}</p>
                  <p className="font-mono text-xs text-muted">
                    {students.find((s) => s.id === sub!.studentId)?.studentNumber} · {same.size} of {words.length} words match
                  </p>
                </div>
                <p className="p-4 text-sm leading-relaxed">
                  {words.map((word, n) => (
                    <span key={n} className={clsx(same.has(n) && "rounded bg-danger-soft")}>
                      {word}{" "}
                    </span>
                  ))}
                </p>
              </Card>
            );
          })}
        </div>
      </>
    );
  }
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
