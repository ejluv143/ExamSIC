import { Card, CardHeader, EmptyState, Table, Th } from "@/components/ui";
import { itemAnalysis, type ItemAttempt } from "@examinus/domain/item-analysis";
import type { Question } from "@examinus/domain/question";
import { questionTypeLabel } from "@/lib/format";
import { shortPrompt } from "../report-view";
import { ItemAnalysisRow, type ItemRowData } from "./item-analysis-row";

const reliability = (kr20: number) =>
  kr20 >= 0.9 ? "excellent" : kr20 >= 0.8 ? "good" : kr20 >= 0.7 ? "acceptable" : kr20 >= 0.5 ? "questionable" : "low";

// How hard each question was and how well it told strong students from weak ones, over each student's latest
// submitted attempt. `attempts` are those attempts only.
export function ItemAnalysisCard({ questions, attempts }: { questions: readonly Question[]; attempts: readonly ItemAttempt[] }) {
  if (attempts.length < 2) {
    return (
      <Card className="overflow-hidden">
        <CardHeader title="Item analysis" description="Difficulty and discrimination of each question." />
        <EmptyState title="Needs at least 2 submitted attempts" />
      </Card>
    );
  }

  const { items, summary } = itemAnalysis(questions, attempts);
  const rows: ItemRowData[] = items.map((item, i) => {
    const q = questions[i]!;
    return {
      number: i + 1,
      typeLabel: questionTypeLabel[q.type],
      n: item.n,
      percent: item.p === null ? null : Math.round(item.p * 100),
      discrimination: item.discrimination,
      quality: item.quality,
      blank: item.blank,
      distractors:
        item.distractors?.map((d) => ({
          label:
            q.type === "multiple_choice"
              ? shortPrompt({ prompt: q.choices.find((c) => c.id === d.key)?.text ?? d.key }, 60)
              : d.key === "true"
                ? "True"
                : "False",
          count: d.count,
          correct: d.correct,
        })) ?? null,
    };
  });

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Item analysis"
        description="Difficulty is the share of students with full points. Discrimination compares each question with how the student did on the rest: 0.30 or more is good, below 0 is a warning."
      />
      <p className="border-b border-border px-5 py-3 text-sm">
        <span className="tabular-nums">N = {summary.n}</span>
        <span className="mx-2 text-muted">·</span>
        <span className="tabular-nums">KR-20 {summary.kr20 === null ? "—" : summary.kr20.toFixed(2)}</span>
        <span className="mx-2 text-muted">·</span>
        <span className="tabular-nums">
          Mean {summary.meanPercent === null ? "—" : `${summary.meanPercent.toFixed(1)}%`}, SD {summary.sdPercent === null ? "—" : `${summary.sdPercent.toFixed(1)}%`}
        </span>
        <span className="mt-0.5 block text-xs text-muted">
          KR-20 {summary.kr20 === null ? "needs 2 or more questions every student got, and some spread in the scores." : `is ${reliability(summary.kr20)}; 0.70 or more is acceptable for a class test.`}{" "}
          Partial credit counts as wrong.
        </span>
      </p>
      <Table>
        <thead>
          <tr>
            <Th>Question</Th>
            <Th className="hidden sm:table-cell">Type</Th>
            <Th className="w-1/3">Difficulty (correct)</Th>
            <Th>Discrimination</Th>
            <Th className="text-right">N</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((item) => (
            <ItemAnalysisRow key={item.number} item={item} />
          ))}
        </tbody>
      </Table>
    </Card>
  );
}
