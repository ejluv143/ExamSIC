"use client";

import { useMemo } from "react";
import type { EditorQuiz } from "@/features/quiz/quiz-editor";
import type { Class } from "@/features/classes/types";
import { Markdown } from "@/components/markdown";
import { answerSheetBlocks } from "./answer-sheet";
import { headerBlocks } from "./header";
import type { Block, PaperDoc } from "./layout";
import type { AssetUrls } from "@/components/question-kinds/shared/print-parts";
import { usePaperPages } from "./pages";
import { partHeading, printedParts } from "./printed";
import { questionBlocks } from "./question-blocks";

function buildBlocks(a: EditorQuiz, classes: Class[], dates: string, urls: AssetUrls, doc: PaperDoc): Block[] {
  const blocks = headerBlocks(a, classes, dates, urls);

  const printed = printedParts(a);
  if (printed.length === 0) {
    const message = doc === "sheet" ? "Add questions to see the answer sheet." : "No questions yet.";
    blocks.push({ space: 24, node: <p style={{ textAlign: "center", color: "#7f7f7f" }}>{message}</p> });
    return blocks;
  }
  if (doc === "sheet") return [...blocks, ...answerSheetBlocks(a)];

  printed.forEach((p, i) => {
    blocks.push(partHeading(p, i === 0 ? 14 : 12));
    const instructions = p.part.instructions.trim();
    if (instructions) blocks.push({ keepWithNext: true, node: <Markdown assetUrls={urls} eager>{instructions}</Markdown> });
    p.questions.forEach((q, j) => blocks.push(...questionBlocks(q, p.start + j, a.paper.answerSheet, urls)));
  });

  return blocks;
}

export function useTestPaper(a: EditorQuiz, classes: Class[], dates: string, urls: AssetUrls, doc: PaperDoc = "paper") {
  const blocks = useMemo(() => buildBlocks(a, classes, dates, urls, doc), [a, classes, dates, urls, doc]);
  const { pages, measurer } = usePaperPages(blocks, a.paper.size);
  return { blocks, pages, measurer };
}
