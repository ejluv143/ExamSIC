"use client";

import { Card, CardHeader, Field, inputClass } from "@/components/ui";
import { pageSizes } from "@/components/test-paper";
import type { PaperFooter, PaperSize } from "@examora/contract";
import { partTotals, type EditorQuiz } from "@/lib/quiz-editor";

const footerFields: { key: keyof PaperFooter; label: string }[] = [
  { key: "documentNo", label: "Document no." },
  { key: "effectivityDate", label: "Effectivity date" },
  { key: "revisionNo", label: "Revision no." },
  { key: "member", label: "Member line" },
  { key: "motto", label: "Motto" },
];

// Settings for the printed paper: size, general instructions and the footer.
export function PaperCard({
  assessment: a,
  onChange,
}: {
  assessment: EditorQuiz;
  onChange: (patch: Partial<EditorQuiz["paper"]>) => void;
}) {
  const p = a.paper;
  return (
    <Card>
      <CardHeader title="Test paper" description="What prints below the header. The preview updates as you type." />
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
              test paper has no answer spaces, so copies can be reused. Switch between the two above the preview to print each.
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
          <p className="text-xs text-muted">
            The paper prints the quiz&apos;s parts as you set them on the Questions page: each part&apos;s title,
            instructions and points.
          </p>
          <ul className="mt-3 space-y-1 text-sm">
            {a.parts.map((part) => (
              <li key={part.id} className="flex justify-between gap-3 rounded-lg border border-border px-3 py-2">
                <span className="min-w-0 truncate font-medium">{part.title || "Untitled part"}</span>
                <span className="shrink-0 text-muted tabular-nums">{partTotals(part).totalPoints} pts</span>
              </li>
            ))}
          </ul>
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
