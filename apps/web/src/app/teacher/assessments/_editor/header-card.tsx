"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { Eye, ImageUp, Printer, X } from "lucide-react";
import { Button, Card, CardHeader, Field, inputClass } from "@/components/ui";
import { PaperHeader } from "@/components/paper-header";
import { OnlineExam } from "@/components/online-exam";
import { PaperPages, pageSizes, useTestPaper, type PaperDoc } from "@/components/test-paper";
import { formatDateRange, periodLabel, semesterLabel } from "@/lib/format";
import type { Assessment, Class, ExamPeriod, PaperHeader as Header, Semester } from "@/lib/types";

const periods: ExamPeriod[] = ["prelim", "midterm", "prefinal", "final"];
const maxLogoBytes = 1024 * 1024;
const noSubscribe = () => () => {};

export function HeaderCard({
  assessment: a,
  classes,
  onChange,
}: {
  assessment: Assessment;
  classes: Class[];
  onChange: (patch: Partial<Header>) => void;
}) {
  const preview = useRef<HTMLDialogElement>(null);
  // Which preview is showing; null while the dialog is closed.
  const [view, setView] = useState<"online" | "printed" | null>(null);
  const [device, setDevice] = useState<"desktop" | "phone">("desktop");
  const openPreview = () => {
    setView("online");
    preview.current?.showModal();
  };
  const h = a.header;
  const autoDates = formatDateRange(a.settings.opensAt, a.settings.closesAt);
  const dates = h.dates.trim() || autoDates;
  const periodOptions: (ExamPeriod | null)[] = a.kind === "exam" ? periods : [null, ...periods];
  const testPaper = useTestPaper(a, classes, dates, "paper");
  const answerSheet = useTestPaper(a, classes, dates, "sheet");
  // Which printed document is showing, and what Print sends to the printer.
  const [printDoc, setPrintDoc] = useState<PaperDoc>("paper");
  const doc: PaperDoc = a.paper.answerSheet ? printDoc : "paper";
  const paper = doc === "sheet" ? answerSheet : testPaper;
  const { width, height } = pageSizes[a.paper.size];

  // The print copy goes straight under <body> so print CSS can hide the rest of the app.
  const inBrowser = useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );

  // Fit the page to the dialog's width on small screens.
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
    <Card>
      <CardHeader
        title="Paper header"
        description="How the top of the test paper looks to students."
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={openPreview}>
              <Eye className="size-4" aria-hidden /> Preview
            </Button>
            <Button variant="secondary" onClick={() => window.print()}>
              <Printer className="size-4" aria-hidden /> Print
            </Button>
          </div>
        }
      />
      <div className="border-b border-border bg-surface-muted p-4 sm:p-5">
        <div className="overflow-hidden rounded-sm shadow-sm ring-1 ring-black/10">
          <div className="bg-white p-[2%]">
            <PaperHeader header={h} kind={a.kind} dates={dates} />
          </div>
        </div>
      </div>

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

      <dialog
        ref={preview}
        aria-label="Preview"
        onClick={(e) => e.target === preview.current && preview.current.close()}
        onClose={() => setView(null)}
        className="m-auto h-[calc(100dvh-2rem)] w-[min(62rem,calc(100vw-2rem))] max-w-none overflow-hidden rounded-xl bg-surface-muted p-0 text-foreground shadow-xl backdrop:bg-black/50"
      >
        <div className="flex h-full flex-col">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface px-5 py-3">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="font-semibold">Preview</h2>
              <Segmented
                label="Preview type"
                value={view ?? "online"}
                options={[
                  ["online", "Online"],
                  ["printed", "Printed"],
                ]}
                onChange={setView}
              />
              {view === "online" ? (
                <Segmented
                  label="Screen size"
                  value={device}
                  options={[
                    ["desktop", "Computer"],
                    ["phone", "Phone"],
                  ]}
                  onChange={setDevice}
                />
              ) : (
                <>
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
                  {paper.pages.length} {paper.pages.length === 1 ? "page" : "pages"} · {pageSizes[a.paper.size].label}
                </p>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              {view === "printed" && (
                <Button onClick={() => window.print()}>
                  <Printer className="size-4" aria-hidden /> Print {doc === "sheet" ? "answer sheet" : ""}
                </Button>
              )}
              <Button variant="ghost" className="px-2" aria-label="Close preview" onClick={() => preview.current?.close()}>
                <X className="size-4" />
              </Button>
            </div>
          </div>
          <div ref={viewport} className="flex-1 overflow-auto p-3 sm:p-6">
            {view === "online" && (
              <div
                className={clsx(
                  "mx-auto bg-background",
                  device === "phone"
                    ? "min-h-full w-[390px] max-w-full rounded-2xl border-8 border-neutral-800 p-3"
                    : "rounded-xl p-3 sm:p-6",
                )}
              >
                <p className="mb-3 text-center text-xs text-muted">
                  What students see when they take it in Examora. Answers aren&apos;t saved.
                </p>
                {/* Sized by its frame, so the phone preview lays out like a real phone. */}
                <div className="@container">
                  <OnlineExam assessment={a} classes={classes} />
                </div>
              </div>
            )}
            {view === "printed" && (
              <div className="mx-auto" style={{ zoom: scale, width: `${width}in`, minHeight: `${height}in` }}>
                <div className="shadow-md [&_.paper-page]:ring-1 [&_.paper-page]:ring-black/10">
                  <PaperPages assessment={a} blocks={paper.blocks} pages={paper.pages} doc={doc} gap="24px" />
                </div>
              </div>
            )}
          </div>
        </div>
      </dialog>
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

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg bg-surface-muted p-0.5 text-sm">
      {options.map(([v, text]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={clsx(
            "rounded-md px-3 py-1 font-medium",
            value === v ? "bg-surface shadow-sm" : "text-muted hover:text-foreground",
          )}
        >
          {text}
        </button>
      ))}
    </div>
  );
}
