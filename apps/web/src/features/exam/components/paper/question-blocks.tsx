import type { Question } from "@examinus/domain/question";
import { QuestionPrint, printTraitsOf } from "@/components/question-kinds/views/print";
import type { Block } from "./layout";
import type { AssetUrls } from "@/components/question-kinds/shared/print-parts";

// With an answer sheet, the test paper only asks; answers go on the sheet. Never prints an answer.
export function questionBlocks(q: Question, n: number, answerSheet: boolean, urls: AssetUrls): Block[] {
  const traits = printTraitsOf(q);
  const blocks: Block[] = [
    { space: traits.space?.(q) ?? 5, node: <QuestionPrint q={q} n={n} answerSheet={answerSheet} urls={urls} /> },
  ];
  if (!answerSheet && traits.writingLines) {
    const { count, height } = traits.writingLines;
    for (let i = 0; i < count; i++) blocks.push({ node: <div style={{ height, borderBottom: "1px solid #000" }} /> });
  }
  return blocks;
}
