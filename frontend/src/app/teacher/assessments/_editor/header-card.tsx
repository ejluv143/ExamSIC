"use client";

import { useState } from "react";
import clsx from "clsx";
import { ImageUp } from "lucide-react";
import { Button, Card, CardHeader, Field, inputClass } from "@/components/ui";
import { formatDateRange, periodLabel, semesterLabel } from "@/lib/format";
import type { Assessment, ExamPeriod, PaperHeader as Header, Semester } from "@/lib/types";

const periods: ExamPeriod[] = ["prelim", "midterm", "prefinal", "final"];
const maxLogoBytes = 1024 * 1024;

export function HeaderCard({
  assessment: a,
  onChange,
}: {
  assessment: Assessment;
  onChange: (patch: Partial<Header>) => void;
}) {
  const h = a.header;
  const autoDates = formatDateRange(a.settings.opensAt, a.settings.closesAt);
  const periodOptions: (ExamPeriod | null)[] = a.kind === "exam" ? periods : [null, ...periods];

  return (
    <Card>
      <CardHeader title="Paper header" description="The letterhead at the top of the first page." />
      <div className="space-y-4 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <LogoField label="School logo" value={h.schoolLogoUrl} onChange={(schoolLogoUrl) => onChange({ schoolLogoUrl })} />
          <LogoField
            label="Department logo"
            value={h.departmentLogoUrl}
            onChange={(departmentLogoUrl) => onChange({ departmentLogoUrl })}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="School">
            <input
              value={h.school}
              onChange={(e) => onChange({ school: e.target.value })}
              placeholder="e.g. San Isidro College"
              className={inputClass}
            />
          </Field>
          <Field label="School address">
            <input
              value={h.schoolAddress}
              onChange={(e) => onChange({ schoolAddress: e.target.value })}
              placeholder="e.g. City of Malaybalay"
              className={inputClass}
            />
          </Field>
          <Field label="Department or school">
            <input
              value={h.department}
              onChange={(e) => onChange({ department: e.target.value })}
              placeholder="e.g. School of Information Technology"
              className={inputClass}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Semester">
              <select
                value={h.semester}
                onChange={(e) => onChange({ semester: e.target.value as Semester })}
                className={inputClass}
              >
                {Object.entries(semesterLabel).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Academic year">
              <input
                value={h.academicYear}
                onChange={(e) => onChange({ academicYear: e.target.value })}
                placeholder="2026-2027"
                className={inputClass}
              />
            </Field>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium">Grading period</legend>
            <div className="flex flex-wrap gap-2">
              {periodOptions.map((p) => {
                const checked = h.period === p;
                return (
                  <label
                    key={p ?? "none"}
                    className={clsx(
                      "cursor-pointer rounded-lg border px-3 py-2 text-sm focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary",
                      checked ? "border-primary bg-primary-soft font-medium" : "border-border hover:bg-surface-muted",
                    )}
                  >
                    <input
                      type="radio"
                      name="period"
                      className="sr-only"
                      checked={checked}
                      onChange={() => onChange({ period: p })}
                    />
                    {p ? periodLabel[p] : "None"}
                  </label>
                );
              })}
            </div>
          </fieldset>
          <Field
            label="Exam dates"
            hint={autoDates ? "Leave empty to use the open and close dates." : "Or set open and close times in Settings."}
          >
            <input
              value={h.dates}
              onChange={(e) => onChange({ dates: e.target.value })}
              placeholder={autoDates || "e.g. October 5-9, 2026"}
              className={inputClass}
            />
          </Field>
        </div>
      </div>

    </Card>
  );
}

function LogoField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null;
  onChange: (url: string | null) => void;
}) {
  const [error, setError] = useState<string | null>(null);

  function pick(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return setError("Choose an image file.");
    if (file.size > maxLogoBytes) return setError("Logo must be 1 MB or smaller.");
    setError(null);
    // TODO: upload to the API and store its URL instead of a data: URL.
    const reader = new FileReader();
    reader.onload = () => onChange(String(reader.result));
    reader.readAsDataURL(file);
  }

  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      <div className="flex items-center gap-3">
        <div className="grid size-12 shrink-0 place-items-center rounded-lg border border-border bg-white p-1">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="" className="size-full object-contain" />
          ) : (
            <ImageUp className="size-5 text-muted" aria-hidden />
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <label className="inline-flex cursor-pointer items-center rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium hover:bg-surface-muted focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary">
            {value ? "Change" : "Upload"}
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              aria-label={`${value ? "Change" : "Upload"} ${label.toLowerCase()}`}
              onChange={(e) => {
                pick(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
          {value && (
            <Button variant="ghost" className="px-2.5 py-1.5" onClick={() => onChange(null)}>
              Remove
            </Button>
          )}
        </div>
      </div>
      {error && (
        <p role="alert" className="mt-1 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
