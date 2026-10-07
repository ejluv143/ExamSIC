"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Database, FileSpreadsheet, ListChecks, Plus, Printer, Users, X } from "lucide-react";
import { Badge, Button, Card, CardHeader, Field, inputBase, inputClass } from "@/components/ui";
import { MathText } from "@/components/math-text";
import { blankAnswers, blankedPrompt } from "@/lib/blanks";
import { questionTypeLabel } from "@/lib/format";
import { maxScore } from "@/lib/scoring";
import { checkQuery } from "@/lib/sql";
import type {
  Assessment,
  AssessmentSettings,
  Class,
  IntegritySettings,
  PaperHeader as Header,
  Question,
  QuestionType,
  ResultsRelease,
} from "@/lib/types";
import { ExcelImport } from "./excel-import";
import { OnlinePreview } from "./online-preview";
import { PaperLayout } from "./paper-layout";
import { PointsDialog } from "./points-dialog";
import { blankQuestion, QuestionEditor } from "./question-editor";

const questionTypes: QuestionType[] = [
  "multiple_choice",
  "true_false",
  "identification",
  "fill_in_the_blank",
  "enumeration",
  "numeric",
  "essay",
  "sql",
  "code",
];

// <input type="datetime-local"> works in local wall time; all schedules are Manila time (UTC+8, no DST).
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const manila = new Date(new Date(iso).getTime() + 8 * 3600_000);
  return manila.toISOString().slice(0, 16);
}
function fromLocalInput(value: string): string | null {
  return value ? `${value}:00+08:00` : null;
}

export type EditorTab = "questions" | "paper";

function validate(a: Assessment): string[] {
  const problems: string[] = [];
  if (!a.title.trim()) problems.push("Add a title.");
  if (a.classIds.length === 0) problems.push("Choose at least one class.");
  if (a.questions.length === 0) problems.push("Add at least one question.");
  a.questions.forEach((q, i) => {
    const n = `Question ${i + 1}`;
    if (!q.prompt.trim()) problems.push(`${n} has no question text.`);
    if (q.points <= 0) problems.push(`${n} must be worth more than 0 points.`);
    if (q.type === "multiple_choice" && q.choices.some((c) => !c.text.trim()))
      problems.push(`${n} has an empty choice.`);
    if (q.type === "identification" && !q.acceptedAnswers.some((x) => x.trim()))
      problems.push(`${n} needs at least one accepted answer.`);
    if (q.type === "fill_in_the_blank" && blankAnswers(q.prompt).length === 0)
      problems.push(`${n} has no blanks. Wrap each answer in [square brackets].`);
    if (q.type === "fill_in_the_blank" && blankAnswers(q.prompt).some((a) => a.length === 0))
      problems.push(`${n} has an empty blank.`);
    if (q.type === "enumeration" && q.items.some((x) => !x.trim()))
      problems.push(`${n} has an empty enumeration item.`);
    if (q.type === "sql" && !q.setupSql.trim()) problems.push(`${n} has no tables (setup SQL).`);
    if (q.type === "sql" && checkQuery(q.answerSql))
      problems.push(`${n}'s answer query: ${checkQuery(q.answerSql)}`);
    if (q.type === "code" && q.tests.length === 0) problems.push(`${n} needs at least one test case.`);
    if (q.type === "code" && q.tests.some((t) => !t.expectedOutput.trim()))
      problems.push(`${n} has a test case with no expected output.`);
  });
  const { opensAt, closesAt } = a.settings;
  if (a.kind === "exam" && (!opensAt || !closesAt)) problems.push("Exams need an open and close time.");
  if (opensAt && closesAt && closesAt <= opensAt) problems.push("Close time must be after open time.");
  return problems;
}

export function AssessmentEditor({
  initial,
  classes,
  bank,
  initialTab = "questions",
}: {
  initial: Assessment;
  classes: Class[];
  bank: Question[];
  initialTab?: EditorTab;
}) {
  const [a, setA] = useState(initial);
  const [tab, setTab] = useState(initialTab);
  const [problems, setProblems] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [bankOpen, setBankOpen] = useState(false);
  // New, empty assessments start with the import open, since that's the fastest way to fill one.
  const [importOpen, setImportOpen] = useState(initial.questions.length === 0);

  const isExam = a.kind === "exam";
  const assignedClasses = useMemo(() => classes.filter((c) => a.classIds.includes(c.id)), [classes, a.classIds]);
  const setSettings = (patch: Partial<AssessmentSettings>) =>
    setA((prev) => ({ ...prev, settings: { ...prev.settings, ...patch } }));
  const integrity = a.settings.integrity;
  const setIntegrity = (patch: Partial<IntegritySettings>) =>
    setA((prev) => ({
      ...prev,
      settings: { ...prev.settings, integrity: { ...prev.settings.integrity, ...patch } },
    }));
  const setHeader = (patch: Partial<Header>) =>
    setA((prev) => ({ ...prev, header: { ...prev.header, ...patch } }));
  const setQuestions = (fn: (qs: Question[]) => Question[]) =>
    setA((prev) => ({ ...prev, questions: fn(prev.questions) }));

  // Both tabs edit the same draft; the URL only remembers which one is showing.
  function switchTab(next: EditorTab) {
    setTab(next);
    const url = new URL(window.location.href);
    if (next === "paper") url.searchParams.set("tab", "paper");
    else url.searchParams.delete("tab");
    window.history.replaceState(null, "", url);
  }

  function save(publish: boolean) {
    const found = publish ? validate(a) : a.title.trim() ? [] : ["Add a title."];
    setProblems(found);
    if (found.length) {
      setNotice(null);
      return;
    }
    const status = publish ? (a.settings.opensAt ? "scheduled" : "open") : "draft";
    setA((prev) => ({ ...prev, status, updatedAt: new Date().toISOString() }));
    // TODO: POST/PUT to the API once backend/api exists.
    setNotice(
      publish
        ? "Published (demo). Changes are kept only on this page until the API is connected."
        : "Draft saved (demo). Changes are kept only on this page until the API is connected.",
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border">
        <nav aria-label="Editor pages" className="-mb-px flex gap-1">
          {(
            [
              ["questions", "Questions", ListChecks],
              ["paper", "Test paper layout", Printer],
            ] as const
          ).map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              aria-current={tab === value ? "page" : undefined}
              onClick={() => switchTab(value)}
              className={clsx(
                "inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium",
                tab === value
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted hover:text-foreground",
              )}
            >
              <Icon className="size-4" aria-hidden /> {label}
            </button>
          ))}
        </nav>
        <div className="flex items-center gap-2 pb-2">
          <Badge tone={a.status === "draft" ? "neutral" : "success"}>{a.status}</Badge>
          <Button variant="secondary" onClick={() => save(false)}>
            Save draft
          </Button>
          <Button onClick={() => save(true)}>Publish</Button>
        </div>
      </div>

      {problems.length > 0 && (
        <ul role="alert" className="space-y-1 rounded-lg bg-danger-soft p-3 text-sm text-danger">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      {notice && (
        <p role="status" className="rounded-lg bg-success-soft p-3 text-sm text-success">
          {notice}
        </p>
      )}

      {tab === "paper" ? (
        <PaperLayout
          assessment={a}
          classes={assignedClasses}
          onHeaderChange={setHeader}
          onPaperChange={(patch) => setA((prev) => ({ ...prev, paper: { ...prev.paper, ...patch } }))}
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
          <div className="min-w-0 space-y-6">
            <Card>
              <CardHeader title="Details" />
              <div className="space-y-4 p-5">
                <Field label="Title">
                  <input
                    value={a.title}
                    onChange={(e) => setA({ ...a, title: e.target.value })}
                    placeholder={isExam ? "e.g. IT302 Final Exam" : "e.g. SQL Joins Quick Check"}
                    className={inputClass}
                  />
                </Field>
                <Field label="Instructions" hint="Shown to students before they start.">
                  <textarea
                    value={a.description}
                    onChange={(e) => setA({ ...a, description: e.target.value })}
                    rows={3}
                    className={inputClass}
                  />
                </Field>
                <ClassAssigner
                  classes={classes}
                  assignedIds={a.classIds}
                  onChange={(classIds) => setA({ ...a, classIds })}
                />
              </div>
            </Card>

            <section aria-labelledby="questions-heading" className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id="questions-heading" className="font-semibold">
                  Questions
                </h2>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => setImportOpen((o) => !o)} aria-expanded={importOpen}>
                    <FileSpreadsheet className="size-4" aria-hidden /> Import from Excel
                  </Button>
                  <Button variant="secondary" onClick={() => setBankOpen((o) => !o)} aria-expanded={bankOpen}>
                    <Database className="size-4" aria-hidden /> Add from question bank
                  </Button>
                </div>
              </div>

              {importOpen && (
                <ExcelImport
                  hasQuestions={a.questions.length > 0}
                  onImport={(imported, mode) => {
                    setQuestions((qs) => (mode === "replace" ? imported : [...qs, ...imported]));
                    setImportOpen(false);
                    setNotice(null);
                  }}
                />
              )}

              {bankOpen && (
                <BankPicker
                  bank={bank}
                  usedPrompts={new Set(a.questions.map((q) => q.prompt))}
                  onPick={(q) =>
                    setQuestions((qs) => [...qs, { ...structuredClone(q), id: crypto.randomUUID().slice(0, 8) }])
                  }
                />
              )}

              {a.questions.map((q, i) => (
                <QuestionEditor
                  key={q.id}
                  question={q}
                  index={i}
                  total={a.questions.length}
                  onChange={(next) => setQuestions((qs) => qs.map((x) => (x.id === q.id ? next : x)))}
                  onRemove={() => setQuestions((qs) => qs.filter((x) => x.id !== q.id))}
                  onMove={(delta) =>
                    setQuestions((qs) => {
                      const next = [...qs];
                      [next[i], next[i + delta]] = [next[i + delta], next[i]];
                      return next;
                    })
                  }
                />
              ))}

              <div className="rounded-xl border border-dashed border-border p-4">
                <p className="mb-2 text-sm text-muted">Add a question</p>
                <div className="flex flex-wrap gap-2">
                  {questionTypes.map((type) => (
                    <Button
                      key={type}
                      variant="secondary"
                      onClick={() => setQuestions((qs) => [...qs, blankQuestion(type)])}
                    >
                      <Plus className="size-4" aria-hidden /> {questionTypeLabel[type]}
                    </Button>
                  ))}
                </div>
              </div>
            </section>
          </div>

          <aside className="space-y-6 lg:sticky lg:top-6 lg:self-start">
            <Card>
              <div className="space-y-3 p-5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted">Questions</span>
                  <span className="font-medium tabular-nums">{a.questions.length}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted">Total points</span>
                  <span className="font-medium tabular-nums">{maxScore(a.questions)}</span>
                </div>
                <PointsDialog
                  questions={a.questions}
                  onSetPoints={(type, points) =>
                    setQuestions((qs) => qs.map((q) => (q.type === type ? { ...q, points } : q)))
                  }
                />
                <div className="pt-2">
                  <OnlinePreview assessment={a} classes={assignedClasses} />
                </div>
              </div>
            </Card>

            <Card>
              <CardHeader title="Settings" />
              <div className="space-y-4 p-5">
                <Field label="Opens">
                  <input
                    type="datetime-local"
                    value={toLocalInput(a.settings.opensAt)}
                    onChange={(e) => setSettings({ opensAt: fromLocalInput(e.target.value) })}
                    className={inputClass}
                  />
                </Field>
                <Field label="Closes">
                  <input
                    type="datetime-local"
                    value={toLocalInput(a.settings.closesAt)}
                    onChange={(e) => setSettings({ closesAt: fromLocalInput(e.target.value) })}
                    className={inputClass}
                  />
                </Field>
                <Field label="Time limit (minutes)" hint="Leave empty for no limit.">
                  <input
                    type="number"
                    min={1}
                    value={a.settings.timeLimitMinutes ?? ""}
                    onChange={(e) =>
                      setSettings({ timeLimitMinutes: e.target.value ? Number(e.target.value) : null })
                    }
                    className={inputClass}
                  />
                </Field>
                <Field label="Attempts allowed">
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={a.settings.attemptsAllowed}
                    onChange={(e) => setSettings({ attemptsAllowed: Math.max(1, Number(e.target.value)) })}
                    className={inputClass}
                  />
                </Field>
                <Field label="Show results to students">
                  <select
                    value={a.settings.resultsRelease}
                    onChange={(e) => setSettings({ resultsRelease: e.target.value as ResultsRelease })}
                    className={inputClass}
                  >
                    <option value="immediately">Right after they submit</option>
                    <option value="after_close">After the exam closes</option>
                    <option value="manual">When I release them</option>
                  </select>
                </Field>
                <div className="space-y-2.5 pt-1">
                  <Toggle
                    label="Shuffle question order"
                    checked={a.settings.shuffleQuestions}
                    onChange={(v) => setSettings({ shuffleQuestions: v })}
                  />
                  <Toggle
                    label="Shuffle choices"
                    checked={a.settings.shuffleChoices}
                    onChange={(v) => setSettings({ shuffleChoices: v })}
                  />
                </div>
              </div>
            </Card>

            <Card>
              <CardHeader title="Anti-cheating" description="When students take it online." />
              <div className="space-y-2.5 p-5">
                <Toggle
                  label="Require full screen"
                  checked={integrity.requireFullscreen}
                  onChange={(v) => setIntegrity({ requireFullscreen: v })}
                />
                <Toggle
                  label="Log switching tabs or apps (Alt+Tab)"
                  checked={integrity.trackFocus}
                  onChange={(v) => setIntegrity({ trackFocus: v })}
                />
                <Toggle
                  label="Allow one screen only (Chrome, Edge)"
                  checked={integrity.blockSecondScreen}
                  onChange={(v) => setIntegrity({ blockSecondScreen: v })}
                />
                <Toggle
                  label="Block copy, paste and right-click"
                  checked={integrity.blockCopyPaste}
                  onChange={(v) => setIntegrity({ blockCopyPaste: v })}
                />
                <Toggle
                  label="Watermark with student's name"
                  checked={integrity.watermark}
                  onChange={(v) => setIntegrity({ watermark: v })}
                />
                <Field
                  label="Auto-submit after warnings"
                  hint="Each switch of tab or app, exit from full screen or second screen is one warning. Empty: never."
                >
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={integrity.autoSubmitAfter ?? ""}
                    onChange={(e) =>
                      setIntegrity({
                        autoSubmitAfter: e.target.value ? Math.max(1, Math.floor(Number(e.target.value))) : null,
                      })
                    }
                    className={inputClass}
                  />
                </Field>
                <p className="pt-1 text-xs text-muted">
                  Answer keys never reach students&apos; browsers, and the time limit is checked on the server.
                </p>
              </div>
            </Card>
          </aside>
        </div>
      )}
    </div>
  );
}

function ClassAssigner({
  classes,
  assignedIds,
  onChange,
}: {
  classes: Class[];
  assignedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [picking, setPicking] = useState(false);
  const assigned = classes.filter((c) => assignedIds.includes(c.id));
  const available = classes.filter((c) => !assignedIds.includes(c.id));

  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Google Classroom classes</h3>
        <Button
          variant="secondary"
          onClick={() => setPicking((p) => !p)}
          disabled={available.length === 0}
          aria-expanded={picking}
        >
          <Plus className="size-4" aria-hidden /> Assign to class
        </Button>
      </div>

      {picking && (
        <div className="mb-2 overflow-hidden rounded-lg border border-border">
          <p className="border-b border-border bg-surface-muted px-3 py-2 text-xs text-muted">
            Choose a class from your Google Classroom.
          </p>
          <ul className="divide-y divide-border">
            {available.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => {
                    onChange([...assignedIds, c.id]);
                    setPicking(false);
                  }}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-surface-muted focus-visible:bg-surface-muted focus-visible:outline-none"
                >
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">
                      {c.courseCode} · {c.section}
                    </span>
                    <span className="block truncate text-xs text-muted">{c.title}</span>
                  </span>
                  <span className="text-xs text-muted tabular-nums">{c.studentIds.length} students</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {assigned.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-sm text-muted">
          Not assigned to any class yet.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {assigned.map((c) => (
            <li key={c.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
              <Users className="size-4 shrink-0 text-muted" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="font-medium">
                  {c.courseCode} · {c.section}
                </span>
                <span className="block truncate text-xs text-muted">
                  {c.title} · {c.studentIds.length} students
                </span>
              </span>
              <Button
                variant="ghost"
                className="px-2"
                aria-label={`Unassign ${c.courseCode} ${c.section}`}
                onClick={() => onChange(assignedIds.filter((id) => id !== c.id))}
              >
                <X className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-1 text-xs text-muted">
        Only students on these classes&apos; Classroom rosters can take it. Missing a class?{" "}
        <Link href="/teacher/classes" className="underline hover:text-foreground">
          Sync from Classroom
        </Link>
        .
      </p>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 text-sm">
      {label}
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 accent-primary"
      />
    </label>
  );
}

function BankPicker({
  bank,
  usedPrompts,
  onPick,
}: {
  bank: Question[];
  usedPrompts: Set<string>;
  onPick: (q: Question) => void;
}) {
  const [topic, setTopic] = useState("");
  const topics = [...new Set(bank.map((q) => q.topic).filter(Boolean))] as string[];
  const shown = bank.filter((q) => !topic || q.topic === topic);

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3">
        <span className="font-medium">Question bank</span>
        <select value={topic} onChange={(e) => setTopic(e.target.value)} className={clsx(inputBase, "py-1.5")}>
          <option value="">All topics</option>
          {topics.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </div>
      <ul className="max-h-80 divide-y divide-border overflow-y-auto">
        {shown.map((q) => {
          const used = usedPrompts.has(q.prompt);
          return (
            <li key={q.id} className="flex items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  <MathText text={blankedPrompt(q.prompt)} />
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  {questionTypeLabel[q.type]} · {q.points} pts{q.topic && ` · ${q.topic}`}
                </p>
              </div>
              <Button variant={used ? "ghost" : "secondary"} disabled={used} onClick={() => onPick(q)}>
                {used ? "Added" : "Add"}
              </Button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
