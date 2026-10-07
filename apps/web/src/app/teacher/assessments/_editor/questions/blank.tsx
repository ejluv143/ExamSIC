"use client";

import clsx from "clsx";
import { TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui";
import { blankModeLabel, clozeInputLabel } from "@/lib/format";
import { blankAnswers, blankStyle, clozeInputs } from "@examora/contract";
import type { BlankMode, BlankQuestion, ClozeInput, Question } from "@examora/contract";
import { Segmented } from "../segmented";
import { CaseToggle, StringList } from "./shared";

export function BlankEditor({ q, onChange }: { q: BlankQuestion; onChange: (q: Question) => void }) {
  // Weights belong to a blank count, so a new mode starts with equal shares.
  const setMode = (mode: BlankMode) => {
    const rest = { ...q };
    delete rest.weights;
    onChange({ ...rest, mode });
  };
  const single = blankStyle(q) === "single";
  const blanks = single ? [] : blankAnswers(q.prompt);
  const setWrong = (i: number, list: string[]) =>
    onChange({
      ...q,
      wrongOptions: Array.from({ length: Math.max(blanks.length, q.wrongOptions.length) }, (_, j) =>
        j === i ? list : (q.wrongOptions[j] ?? []),
      ),
    });
  const bankWords = [...new Set(blanks.map((a) => a[0]).filter((w): w is string => !!w))];

  return (
    <div className="space-y-3">
      <Segmented
        label="Blank type"
        value={q.mode}
        options={(Object.keys(blankModeLabel) as BlankMode[]).map((m) => [m, blankModeLabel[m]])}
        onChange={setMode}
      />

      {single ? (
        <div className="space-y-2">
          <p className="text-xs text-muted">
            No blanks in the question: students type one answer. Any of these is correct. Or use <b>Insert blank</b> to
            put blanks inside the sentence.
          </p>
          <StringList
            values={q.acceptedAnswers.length === 0 ? [""] : q.acceptedAnswers}
            onChange={(acceptedAnswers) => onChange({ ...q, acceptedAnswers })}
            placeholder="Accepted answer"
            addLabel="Add accepted answer"
            label="Accepted answer"
            min={1}
          />
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-muted">
            Use <b>Insert blank</b> in the toolbar, or write <code>{"{{answer}}"}</code> in the question. Separate other
            accepted answers with <code>|</code>, e.g. <code>{"{{primary key|PK}}"}</code>.
          </p>
          {blanks.length === 0 ? (
            <p className="flex items-center gap-2 rounded-lg bg-warning-soft p-3 text-sm text-warning">
              <TriangleAlert className="size-4 shrink-0" aria-hidden /> No blanks yet.
            </p>
          ) : (
            <ol className="space-y-1 rounded-lg bg-surface-muted p-3 text-sm" aria-label="Blanks">
              {blanks.map((answers, i) => (
                <li key={i} className="flex gap-2">
                  <span className="w-14 shrink-0 text-muted">Blank {i + 1}</span>
                  <span className={clsx("min-w-0 break-words font-medium", answers.length === 0 && "text-danger")}>
                    {answers.join(" / ") || "(empty)"}
                  </span>
                </li>
              ))}
            </ol>
          )}
          {q.mode === "cloze" && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">Students</span>
                <Segmented
                  label="How students fill the blanks"
                  value={q.clozeInput}
                  options={clozeInputs.map((c): [ClozeInput, string] => [c, clozeInputLabel[c]])}
                  onChange={(clozeInput) => onChange({ ...q, clozeInput })}
                />
              </div>
              {q.clozeInput === "dropdown" &&
                blanks.map((answers, i) => (
                  <div key={i} className="rounded-lg border border-border p-3">
                    <p className="mb-2 text-sm font-medium">
                      Blank {i + 1}: wrong options{" "}
                      <span className="font-normal text-muted">(the right answer is {answers[0] || "?"})</span>
                    </p>
                    <StringList
                      values={q.wrongOptions[i] ?? []}
                      onChange={(list) => setWrong(i, list)}
                      placeholder="Wrong option"
                      addLabel="Add wrong option"
                      label={`Blank ${i + 1} wrong option`}
                    />
                  </div>
                ))}
              {q.clozeInput === "bank" && (
                <div className="rounded-lg border border-border p-3">
                  <p className="mb-1 text-sm font-medium">Word bank</p>
                  <p className="mb-2 text-xs text-muted">
                    Students pick from one shared list: the answer of every blank plus the extra words below.
                  </p>
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {bankWords.map((w) => (
                      <Badge key={w} tone="primary">
                        {w}
                      </Badge>
                    ))}
                    {q.extraWords.filter((w) => w.trim()).map((w, i) => (
                      <Badge key={`extra-${i}`}>{w} (extra)</Badge>
                    ))}
                  </div>
                  <StringList
                    values={q.extraWords}
                    onChange={(extraWords) => onChange({ ...q, extraWords })}
                    placeholder="Extra word"
                    addLabel="Add extra word"
                    label="Extra word"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}
      <CaseToggle checked={q.caseSensitive} onChange={(caseSensitive) => onChange({ ...q, caseSensitive })} />
    </div>
  );
}
