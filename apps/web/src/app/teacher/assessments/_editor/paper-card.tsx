"use client";

import { Card, CardHeader, Field, inputClass } from "@/components/ui";
import { defaultPart, groupIntoParts, pageSizes } from "@/components/test-paper";
import { questionTypeLabel } from "@/lib/format";
import type { Assessment, PaperFooter, PaperSettings, PaperSize, QuestionType } from "@/lib/types";

const roman = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

const footerFields: { key: keyof PaperFooter; label: string }[] = [
  { key: "documentNo", label: "Document no." },
  { key: "effectivityDate", label: "Effectivity date" },
  { key: "revisionNo", label: "Revision no." },
  { key: "member", label: "Member line" },
  { key: "motto", label: "Motto" },
];

// Settings for the printed paper: size, general instructions, part titles and the footer.
export function PaperCard({
  assessment: a,
  onChange,
}: {
  assessment: Assessment;
  onChange: (patch: Partial<PaperSettings>) => void;
}) {
  const p = a.paper;
  const parts = groupIntoParts(a.questions);
  const setPart = (type: QuestionType, patch: { title?: string; instructions?: string }) =>
    onChange({
      parts: { ...p.parts, [type]: { title: "", instructions: "", ...p.parts[type], ...patch } },
    });

  return (
    <Card>
      <CardHeader title="Test paper" description="What prints below the header. Use Preview to check the pages." />
      <div className="space-y-5 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Paper size">
            <select
              value={p.size}
              onChange={(e) => onChange({ size: e.target.value as PaperSize })}
              className={inputClass}
            >
              {Object.entries(pageSizes).map(([value, { label }]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Instructor" hint="Printed under the course title.">
            <input
              value={p.instructor}
              onChange={(e) => onChange({ instructor: e.target.value })}
              className={inputClass}
            />
          </Field>
        </div>

        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3">
          <input
            type="checkbox"
            checked={!!p.answerSheet}
            onChange={(e) => onChange({ answerSheet: e.target.checked })}
            className="mt-0.5 size-4 accent-primary"
          />
          <span className="text-sm">
            <span className="font-medium">Use a separate answer sheet</span>
            <span className="mt-0.5 block text-muted">
              Students shade bubbles for multiple choice and true or false, and write other answers on lines. The
              test paper has no answer spaces, so copies can be reused. Print both from Preview → Printed.
            </span>
          </span>
        </label>

        <Field label="General instructions" hint="One per line. The first word of each line prints in red.">
          <textarea
            value={p.generalInstructions.join("\n")}
            onChange={(e) => onChange({ generalInstructions: e.target.value.split("\n") })}
            rows={6}
            className={inputClass}
          />
        </Field>

        <div>
          <h3 className="mb-1 text-sm font-medium">Parts</h3>
          <p className="mb-3 text-xs text-muted">
            Each question type prints as one part. Leave a field empty to use the default.
          </p>
          {parts.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-sm text-muted">
              Parts appear here once you add questions.
            </p>
          ) : (
            <ul className="space-y-3">
              {parts.map((part, i) => (
                <li key={part.type} className="rounded-lg border border-border p-3">
                  <p className="mb-2 text-sm font-medium">
                    Part {roman[i] ?? i + 1}{" "}
                    <span className="font-normal text-muted">
                      · {questionTypeLabel[part.type]} · {part.questions.length}{" "}
                      {part.questions.length === 1 ? "item" : "items"}
                    </span>
                  </p>
                  <div className="grid gap-3 sm:grid-cols-[14rem_1fr]">
                    <input
                      value={p.parts[part.type]?.title ?? ""}
                      onChange={(e) => setPart(part.type, { title: e.target.value })}
                      placeholder={defaultPart(part.type, p.answerSheet).title}
                      aria-label={`Part ${i + 1} title`}
                      className={inputClass}
                    />
                    <input
                      value={p.parts[part.type]?.instructions ?? ""}
                      onChange={(e) => setPart(part.type, { instructions: e.target.value })}
                      placeholder={defaultPart(part.type, p.answerSheet).instructions}
                      aria-label={`Part ${i + 1} instructions`}
                      className={inputClass}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h3 className="mb-3 text-sm font-medium">Footer</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            {footerFields.map(({ key, label }) => (
              <div key={key} className={key === "member" || key === "motto" ? "sm:col-span-3" : undefined}>
                <Field label={label}>
                  <input
                    value={p.footer[key]}
                    onChange={(e) => onChange({ footer: { ...p.footer, [key]: e.target.value } })}
                    className={inputClass}
                  />
                </Field>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}
