import clsx from "clsx";
import { Card, CardHeader, EmptyState, Table, Td, Th } from "@/components/ui";
import type { AttemptDetail, MasterySettings, Question } from "@examora/contract";

type Cell = { tries: number; mastered: boolean | null };

// How one question went: tries used and whether it was mastered. null: never tried.
function cellOf(detail: AttemptDetail | undefined, questionId: string): Cell | null {
  const answer = detail?.answers.find((a) => a.questionId === questionId);
  return answer && (answer.tries ?? 0) > 0 ? { tries: answer.tries ?? 0, mastered: answer.correct } : null;
}

export const triesText = (tries: number) => `${tries} ${tries === 1 ? "try" : "tries"}`;

// The teacher's mastery breakdown: a row per student, a column per question with the tries it took.
export function MasteryTable({
  settings,
  questions,
  rows,
}: {
  settings: MasterySettings;
  questions: readonly Question[];
  rows: readonly { id: string; name: string; attempt: AttemptDetail | undefined }[];
}) {
  const started = rows.filter((r) => r.attempt);
  return (
    <Card className="mt-6">
      <CardHeader
        title="Mastery"
        description={`Tries each student needed per question. A question is done when it is answered correctly or after ${settings.retryLimit} ${settings.retryLimit === 1 ? "try" : "tries"}${settings.targetPercent === null ? "" : `. Target: ${settings.targetPercent}%`}.`}
      />
      {started.length === 0 ? (
        <EmptyState title="Nobody has started yet" />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th className="text-right">Mastered</Th>
              {questions.map((q, i) => (
                <Th key={q.id} className="text-center">
                  Q{i + 1}
                </Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ id, name, attempt }) => {
              const cells = questions.map((q) => cellOf(attempt, q.id));
              const mastered = cells.filter((c) => c?.mastered === true).length;
              return (
                <tr key={id}>
                  <Td className="font-medium">{name}</Td>
                  <Td className="text-right tabular-nums">
                    {attempt ? `${mastered} / ${questions.length}` : "—"}
                  </Td>
                  {cells.map((c, i) => (
                    <Td key={questions[i]!.id} className="text-center text-xs tabular-nums">
                      {c === null ? (
                        <span className="text-muted">—</span>
                      ) : (
                        <span
                          title={c.mastered === null ? "Waits for grading" : c.mastered ? "Mastered" : "Not mastered"}
                          className={clsx(
                            "inline-block rounded-full px-2 py-0.5 font-medium",
                            c.mastered === null
                              ? "bg-surface-muted text-muted"
                              : c.mastered
                                ? "bg-success-soft text-success"
                                : "bg-danger-soft text-danger",
                          )}
                        >
                          {c.mastered === null ? "grading" : `${c.mastered ? "✓" : "✗"} ${c.tries}`}
                        </span>
                      )}
                    </Td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </Card>
  );
}
