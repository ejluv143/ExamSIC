import type { Metadata } from "next";
import { notFound } from "next/navigation";
import clsx from "clsx";
import { Badge, Card, PageHeader, Table, Td, Th } from "@/components/ui";
import { answerText, quizQuestions } from "@/features/session/attempt-view";
import { getAttempts, getSession } from "@/features/session/data";
import { getStudents } from "@/features/classes/data";
import { fullName } from "@/lib/format";
import { type Question } from "@examinus/domain/question";
import { type AnswerValue } from "@examinus/domain/quiz";
import { integrityCaseFile } from "@examinus/domain/session-integrity";
import { matchingLines, matchingPhrases, sourceKind } from "@examinus/domain/similarity";

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
  if (pairKind !== "wrong_answers" && pairKind !== "essay_text" && pairKind !== "code") notFound();

  const attempts = await getAttempts(sessionId);
  // Only a pair that counted toward a level can be compared.
  const found = integrityCaseFile({ questions, attempts }).drillDown(
    pairKind,
    typeof attemptA === "string" ? attemptA : "",
    typeof attemptB === "string" ? attemptB : "",
    typeof questionId === "string" ? questionId : undefined,
  );
  if (!found) notFound();
  const pair = [found.a, found.b];
  const students = await getStudents(pair.map((d) => d.studentId));
  const nameOf = (i: number) => {
    const student = students.find((s) => s.id === pair[i]!.studentId);
    return student ? fullName(student) : "Unknown student";
  };
  const back = { href: `/teacher/assessments/${quizId}/sessions/${sessionId}/integrity`, label: "Anti-cheating" };

  if (pairKind === "wrong_answers") {
    // The questions the pair gave the same rare wrong answer on: the ones that counted as a finding.
    const shared = found.questions.map((question) => ({
      question,
      a: describe(question, found.a.answers.find((x) => x.questionId === question.id)?.value ?? null),
      b: describe(question, found.b.answers.find((x) => x.questionId === question.id)?.value ?? null),
    }));
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
              {shared.map(({ question, a, b }) => (
                <tr key={question.id}>
                  <Td className="tabular-nums text-muted">Q{questions.indexOf(question) + 1}</Td>
                  <Td className="bg-danger-soft whitespace-pre-wrap">{a}</Td>
                  <Td className="bg-danger-soft whitespace-pre-wrap">{b}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </>
    );
  }
  const q = found.questions[0];
  if (q?.type !== "code" && q?.type !== "essay") notFound();

  if (q.type === "essay") {
    const texts = pair.map((d) => answerText(d, q.id));
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
              <Card key={sub.attempt.id} className="min-w-0 overflow-hidden">
                <div className="border-b border-border px-4 py-3">
                  <p className="font-medium">{nameOf(i)}</p>
                  <p className="font-mono text-xs text-muted">
                    {students.find((s) => s.id === sub.studentId)?.studentNumber} · {same.size} of {words.length} words match
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
  const texts = pair.map((d) => answerText(d, q.id));
  const kind = sourceKind(q.language);
  const score = found.finding.strength;

  return (
    <>
      <PageHeader
        back={{ href: `/teacher/assessments/${quizId}/sessions/${sessionId}/integrity`, label: "Anti-cheating" }}
        title="Compare answers"
        description={
          <span className="flex flex-wrap items-center gap-2">
            Question {questions.indexOf(q) + 1}
            <Badge tone={found.finding.verdict === "danger" ? "danger" : "warning"}>{Math.round(score * 100)}% similar</Badge>
            Highlighted lines match the other answer once names, numbers and spacing are ignored.
          </span>
        }
      />
      <div className="grid gap-4 lg:grid-cols-2">
        {pair.map((sub, i) => {
          const student = students.find((s) => s.id === sub.studentId);
          const same = matchingLines(texts[i], texts[1 - i], q.starterCode, kind);
          const lines = texts[i].split("\n");
          return (
            <Card key={sub.attempt.id} className="min-w-0 overflow-hidden">
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
