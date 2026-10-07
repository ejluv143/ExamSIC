"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Database, FileSpreadsheet, ListChecks, Plus, Printer } from "lucide-react";
import { Button, Card, CardHeader, Field, inputBase, inputClass } from "@/components/ui";
import { MathText } from "@/components/math-text";
import { blankAnswers, blankedPrompt } from "@/lib/blanks";
import { questionTypeLabel } from "@/lib/format";
import { maxScore } from "@examora/contract/scoring";
import { checkQuery } from "@/lib/sql";
import { guessSubjectArea, questionTypesFor, subjectAreaLabel } from "@/lib/subjects";
import type { PaperHeader as Header, Question, QuestionType, QuizSettings, SubjectArea } from "@examora/contract";
import type { EditorQuiz } from "@/lib/quiz-editor";
import type { Class } from "@/lib/types";
import { ExcelImport } from "./excel-import";
import { OnlinePreview } from "./online-preview";
import { PaperLayout } from "./paper-layout";
import { PointsDialog } from "./points-dialog";
import { blankQuestion, QuestionEditor } from "./question-editor";
import { saveQuizAction } from "../actions";

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

export type EditorTab = "questions" | "paper";

function validate(a: EditorQuiz): string[] {
  const problems: string[] = [];
  if (!a.title.trim()) problems.push("Add a title.");
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
  return problems;
}

export function QuizEditor({
  initial,
  classes,
  bank,
  sessionDates,
  initialTab = "questions",
  saved,
}: {
  initial: EditorQuiz;
  classes: Class[];
  bank: readonly Question[];
  // The dates of the quiz's latest session, printed on the paper when the header has none.
  sessionDates: string;
  initialTab?: EditorTab;
  // Set after a save, which reloads the page to pick up the ids the server gave the new parts.
  saved?: boolean;
}) {
  const router = useRouter();
  const [a, setA] = useState(initial);
  const [showAllTypes, setShowAllTypes] = useState(false);
  // The teacher's subjects (one per course code), each with its subject type.
  const subjects = useMemo(() => {
    const byCode: Record<string, { courseCode: string; title: string; area: SubjectArea }> = {};
    for (const c of classes)
      byCode[c.courseCode] ??= {
        courseCode: c.courseCode,
        title: c.title,
        area: c.subjectArea ?? guessSubjectArea(c.courseCode, c.title),
      };
    return Object.values(byCode);
  }, [classes]);
  const area: SubjectArea = a.subjectArea ?? "general";
  const allowedTypes = questionTypesFor[area];
  // The classes of the quiz's subject, for the course line on the printed paper.
  const subjectClasses = useMemo(() => classes.filter((c) => c.courseCode === a.subject), [classes, a.subject]);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState(initialTab);
  const [problems, setProblems] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(saved ? "Saved." : null);
  const [bankOpen, setBankOpen] = useState(false);
  // New, empty quizzes start with the import open, since that's the fastest way to fill one.
  const [importOpen, setImportOpen] = useState(initial.questions.length === 0);

  const setSettings = (patch: Partial<QuizSettings>) =>
    setA((prev) => ({ ...prev, settings: { ...prev.settings, ...patch } }));
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

  async function save() {
    const found = validate(a);
    setProblems(found);
    if (found.length) {
      setNotice(null);
      return;
    }
    setSaving(true);
    // (A new quiz is redirected to its own edit page by the action, with the notice in the address.)
    const result = await saveQuizAction(a);
    setSaving(false);
    if ("error" in result) {
      setProblems([result.error]);
      setNotice(null);
      return;
    }
    // Reload the page, so the editor starts again from what the server saved (part ids included).
    const url = new URL(window.location.href);
    url.searchParams.set("saved", "1");
    router.replace(`${url.pathname}${url.search}`);
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
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
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
          classes={subjectClasses}
          sessionDates={sessionDates}
          onHeaderChange={setHeader}
          onPaperChange={(patch) => setA((prev) => ({ ...prev, paper: { ...prev.paper, ...patch } }))}
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
          <div className="min-w-0 space-y-6">
            <Card>
              <CardHeader title="Details" />
              <div className="space-y-4 p-5">
                <Field label="Subject" hint="Decides which question types you can add.">
                  <select
                    value={a.subject ? `course:${a.subject}` : `area:${area}`}
                    onChange={(e) => {
                      const at = e.target.value.indexOf(":");
                      const kind = e.target.value.slice(0, at);
                      const value = e.target.value.slice(at + 1);
                      if (kind === "course") {
                        const course = subjects.find((s) => s.courseCode === value)!;
                        setA((prev) => ({ ...prev, subject: course.courseCode, subjectArea: course.area }));
                      } else setA((prev) => ({ ...prev, subject: undefined, subjectArea: value as SubjectArea }));
                    }}
                    className={inputClass}
                  >
                    {subjects.length > 0 && (
                      <optgroup label="Your subjects">
                        {subjects.map((s) => (
                          <option key={s.courseCode} value={`course:${s.courseCode}`}>
                            {s.courseCode} · {s.title} ({subjectAreaLabel[s.area]})
                          </option>
                        ))}
                      </optgroup>
                    )}
                    <optgroup label="Subject types">
                      {(Object.keys(subjectAreaLabel) as SubjectArea[]).map((k) => (
                        <option key={k} value={`area:${k}`}>
                          {subjectAreaLabel[k]}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </Field>
                <Field label="Title">
                  <input
                    value={a.title}
                    onChange={(e) => setA({ ...a, title: e.target.value })}
                    placeholder="e.g. SQL Joins Quick Check"
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
                  bank={showAllTypes ? bank : bank.filter((q) => allowedTypes.includes(q.type))}
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
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-muted">
                    Add a question{" "}
                    {!showAllTypes && <span>· {subjectAreaLabel[area]} question types</span>}
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowAllTypes((v) => !v)}
                    className="text-xs text-muted underline hover:text-foreground"
                  >
                    {showAllTypes ? `Only ${subjectAreaLabel[area]} types` : "Show all question types"}
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(showAllTypes ? questionTypes : allowedTypes).map((type) => (
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
                  <OnlinePreview assessment={a} classes={subjectClasses} />
                </div>
              </div>
            </Card>

            <Card>
              <CardHeader title="Settings" />
              <div className="space-y-2.5 p-5">
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
                <p className="pt-1 text-xs text-muted">
                  Each student gets their own order. The schedule, time limit and anti-cheating rules are set when you
                  start a session.
                </p>
              </div>
            </Card>
          </aside>
        </div>
      )}
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
  bank: readonly Question[];
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
