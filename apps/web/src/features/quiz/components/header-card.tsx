"use client";

import { useState } from "react";
import clsx from "clsx";
import { ImageUp } from "lucide-react";
import { assetMimes, assetRef } from "@examinus/domain/asset";
import { Button, Card, CardHeader, Field, inputClass } from "@/components/ui";
import { Select } from "@/components/select";
import type { AssetUrls } from "@/components/question-kinds/shared/print-parts";
import { logoSrc } from "@/features/exam/components/paper-header";
import { uploadImage } from "@/features/assets/upload-image";
import { periodLabel, semesterLabel } from "@/lib/format";
import type { ExamPeriod, PaperHeader as Header, Semester } from "@examinus/domain/quiz";

const periods: ExamPeriod[] = ["prelim", "midterm", "prefinal", "final"];

export function HeaderCard({
  header: h,
  sessionDates,
  assetUrls,
  onChange,
}: {
  header: Header;
  // The dates of the quiz's latest session, printed when this is empty.
  sessionDates: string;
  // Signed URLs of the uploaded logos.
  assetUrls: AssetUrls;
  onChange: (patch: Partial<Header>) => void;
}) {
  const periodOptions: (ExamPeriod | null)[] = [null, ...periods];

  return (
    <Card>
      <CardHeader title="Paper header" description="The letterhead at the top of the first page." />
      <div className="space-y-4 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <LogoField
            label="School logo"
            value={h.schoolLogoUrl}
            urls={assetUrls}
            onChange={(schoolLogoUrl) => onChange({ schoolLogoUrl })}
          />
          <LogoField
            label="Department logo"
            value={h.departmentLogoUrl}
            urls={assetUrls}
            onChange={(departmentLogoUrl) => onChange({ departmentLogoUrl })}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="School">
            <input
              value={h.school}
              onChange={(e) => onChange({ school: e.target.value })}
              placeholder="Your school's name"
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
              placeholder="College or department"
              className={inputClass}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Semester">
              <Select<Semester>
                value={h.semester}
                onChange={(semester) => onChange({ semester })}
                className="w-full"
                options={(Object.entries(semesterLabel) as [Semester, string][]).map(([value, label]) => ({ value, label }))}
              />
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
            hint={sessionDates ? "Leave empty to use the dates of the latest session." : "Leave empty to print no dates."}
          >
            <input
              value={h.dates}
              onChange={(e) => onChange({ dates: e.target.value })}
              placeholder={sessionDates || "e.g. October 5-9, 2026"}
              className={inputClass}
            />
          </Field>
        </div>
      </div>

    </Card>
  );
}

// Uploads the logo like any question image and keeps `asset:<id>` in the header, so the quiz carries no image data.
function LogoField({
  label,
  value,
  urls,
  onChange,
}: {
  label: string;
  value: string | null;
  urls: AssetUrls;
  onChange: (value: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const src = value === null ? undefined : logoSrc(value, urls);

  async function pick(file: File | undefined) {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const uploaded = await uploadImage(file, "question");
      onChange(assetRef(uploaded.assetId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "The logo couldn't be uploaded.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      <div className="flex items-center gap-3">
        <div className="grid size-12 shrink-0 place-items-center rounded-lg border border-border bg-white p-1">
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt="" className="size-full object-contain" />
          ) : (
            <ImageUp className="size-5 text-muted" aria-hidden />
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <label
            className={clsx(
              "inline-flex items-center rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary",
              busy ? "cursor-wait opacity-60" : "cursor-pointer hover:bg-surface-muted",
            )}
          >
            {busy ? "Uploading…" : value ? "Change" : "Upload"}
            <input
              type="file"
              accept={assetMimes.join(",")}
              className="sr-only"
              disabled={busy}
              aria-label={`${value ? "Change" : "Upload"} ${label.toLowerCase()}`}
              onChange={(e) => {
                void pick(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
          {value && (
            <Button variant="ghost" className="px-2.5 py-1.5" disabled={busy} onClick={() => onChange(null)}>
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
