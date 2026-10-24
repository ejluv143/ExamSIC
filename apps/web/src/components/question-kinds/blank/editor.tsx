"use client";

import { useState } from "react";
import { TriangleAlert } from "lucide-react";
import { Badge, inputClass } from "@/components/ui";
import { blanks as promptBlanks, replaceBlank, splitAlternatives } from "@examinus/domain/blanks";
import { StringList } from "../shared/editor-fields";
import type { EditorProps } from "../views/editor";

// The accepted answers of one blank as one line, "primary key | PK". The text is kept as typed (spaces, a trailing
// bar) and only follows the prompt when the answers change from outside it.
function AnswersInput({ answers, onChange, label }: { answers: string[]; onChange: (answers: string[]) => void; label: string }) {
  const key = answers.join("\u0000");
  const [draft, setDraft] = useState(answers.join(" | "));
  const [seen, setSeen] = useState(key);
  if (seen !== key) {
    setSeen(key);
    if (splitAlternatives(draft).join("\u0000") !== key) setDraft(answers.join(" | "));
  }
  return (
    <input
      value={draft}
      onChange={(e) => {
        // Braces would end the marker in the prompt.
        const text = e.target.value.replace(/[{}]/g, "");
        setDraft(text);
        onChange(splitAlternatives(text));
      }}
      placeholder="Answer | other accepted answer"
      aria-label={label}
      className={inputClass}
    />
  );
}

export function Editor({ q, onChange }: EditorProps<"blank">) {
  const blanks = promptBlanks(q.prompt);
  const setWrong = (i: number, list: string[]) =>
    onChange({
      ...q,
      wrongOptions: Array.from({ length: Math.max(blanks.length, q.wrongOptions.length) }, (_, j) =>
        j === i ? list : (q.wrongOptions[j] ?? []),
      ),
    });
  const bankWords = [...new Set(blanks.map((b) => b.answers[0]).filter((w): w is string => !!w))];

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">
        Use <b>+ Blank</b> beside the cursor in the question, or write <code>{"{{answer}}"}</code>. Separate other accepted
        answers with <code>|</code>, e.g. <code>{"{{primary key|PK}}"}</code>. Start with <code>#</code> for one box per
        letter: <code>{"{{#Manila}}"}</code>.
      </p>
      {blanks.length === 0 ? (
        <p className="flex items-center gap-2 rounded-lg bg-warning-soft p-3 text-sm text-warning">
          <TriangleAlert className="size-4 shrink-0" aria-hidden /> No blanks yet.
        </p>
      ) : (
        <ol className="space-y-2" aria-label="Blanks">
          {blanks.map((blank, i) => (
            <li key={i} className="space-y-2 rounded-lg bg-surface-muted p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">Blank {i + 1}</span>
                <label className="flex cursor-pointer items-center gap-2 text-muted">
                  <input
                    type="checkbox"
                    checked={blank.boxes}
                    onChange={(e) => onChange({ ...q, prompt: replaceBlank(q.prompt, i, { ...blank, boxes: e.target.checked }) })}
                    className="size-4 accent-primary"
                  />
                  One letter per box
                </label>
              </div>
              <AnswersInput
                answers={blank.answers}
                label={`Blank ${i + 1} accepted answers`}
                onChange={(answers) => onChange({ ...q, prompt: replaceBlank(q.prompt, i, { ...blank, answers }) })}
              />
              {blank.boxes && (
                <p className="text-xs text-muted">
                  Students see one box per letter of the first answer, with a gap between words, so its length is given away on
                  purpose.
                </p>
              )}
              {q.clozeInput === "dropdown" && (
                <div>
                  <p className="mb-2 font-medium">
                    Wrong options <span className="font-normal text-muted">(the right answer is {blank.answers[0] || "?"})</span>
                  </p>
                  <StringList
                    values={q.wrongOptions[i] ?? []}
                    onChange={(list) => setWrong(i, list)}
                    placeholder="Wrong option"
                    addLabel="Add wrong option"
                    label={`Blank ${i + 1} wrong option`}
                  />
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
      {q.clozeInput === "bank" && (
        <div className="rounded-lg bg-surface-muted/60 p-3">
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
  );
}
