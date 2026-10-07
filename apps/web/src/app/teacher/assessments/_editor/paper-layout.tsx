"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Printer } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { PaperPages, pageSizes, useTestPaper, type AssetUrls, type PaperDoc } from "@/components/test-paper";
import type { PaperHeader as Header } from "@examora/contract";
import type { EditorQuiz } from "@/lib/quiz-editor";
import type { Class } from "@/lib/types";
import { HeaderCard } from "./header-card";
import { PaperCard } from "./paper-card";
import { Segmented } from "./segmented";

const noSubscribe = () => () => {};

// The "Test paper layout" page: header and paper settings beside a live preview of the printed pages.
export function PaperLayout({
  assessment: a,
  classes,
  sessionDates,
  assetUrls,
  onHeaderChange,
  onPaperChange,
}: {
  assessment: EditorQuiz;
  classes: Class[];
  // The dates of the quiz's latest session, printed when the header has none.
  sessionDates: string;
  // Signed URLs of the pictures printed on the paper.
  assetUrls: AssetUrls;
  onHeaderChange: (patch: Partial<Header>) => void;
  onPaperChange: (patch: Partial<EditorQuiz["paper"]>) => void;
}) {
  const dates = a.header.dates.trim() || sessionDates;
  const testPaper = useTestPaper(a, classes, dates, assetUrls, "paper");
  const answerSheet = useTestPaper(a, classes, dates, assetUrls, "sheet");
  // Which printed document is showing, and what Print sends to the printer.
  const [printDoc, setPrintDoc] = useState<PaperDoc>("paper");
  const doc: PaperDoc = a.paper.answerSheet ? printDoc : "paper";
  const paper = doc === "sheet" ? answerSheet : testPaper;
  const { width, height, label: sizeLabel } = pageSizes[a.paper.size];

  // The print copy goes straight under <body> so print CSS can hide the rest of the app.
  const inBrowser = useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );

  // Fit the page to the preview column's width.
  const [scale, setScale] = useState(1);
  const viewport = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      if (el.clientWidth > 0) setScale(Math.min(1, (el.clientWidth - 24) / (width * 96)));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [width]);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="min-w-0 space-y-6">
        <HeaderCard header={a.header} sessionDates={sessionDates} onChange={onHeaderChange} />
        <PaperCard assessment={a} onChange={onPaperChange} />
      </div>

      <Card className="flex min-w-0 flex-col overflow-hidden lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)] lg:self-start">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
          <div className="flex flex-wrap items-center gap-3">
            {a.paper.answerSheet && (
              <Segmented
                label="Document"
                value={doc}
                options={[
                  ["paper", "Test paper"],
                  ["sheet", "Answer sheet"],
                ]}
                onChange={setPrintDoc}
              />
            )}
            <p className="text-sm text-muted">
              {paper.pages.length} {paper.pages.length === 1 ? "page" : "pages"} · {sizeLabel}
            </p>
          </div>
          <Button onClick={() => window.print()}>
            <Printer className="size-4" aria-hidden /> Print {doc === "sheet" ? "answer sheet" : ""}
          </Button>
        </div>
        <div ref={viewport} className="flex-1 overflow-auto bg-surface-muted p-3">
          <div className="mx-auto" style={{ zoom: scale, width: `${width}in`, minHeight: `${height}in` }}>
            <div className="shadow-md [&_.paper-page]:ring-1 [&_.paper-page]:ring-black/10">
              <PaperPages assessment={a} blocks={paper.blocks} pages={paper.pages} doc={doc} gap="24px" />
            </div>
          </div>
        </div>
      </Card>

      {testPaper.measurer}
      {answerSheet.measurer}
      {inBrowser &&
        createPortal(
          <div className="print-root">
            <style>{`@page { size: ${width}in ${height}in; margin: 0; }`}</style>
            <PaperPages assessment={a} blocks={paper.blocks} pages={paper.pages} doc={doc} />
          </div>,
          document.body,
        )}
    </div>
  );
}
