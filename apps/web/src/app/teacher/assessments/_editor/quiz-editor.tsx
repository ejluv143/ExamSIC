"use client";

import { useMemo, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Database, FileSpreadsheet, GripVertical, ListChecks, Plus, Printer } from "lucide-react";
import { Button, Card, CardHeader, Field, inputBase, inputClass } from "@/components/ui";
import { Markdown } from "@/components/markdown";
import { MarkdownEditor } from "@/components/markdown-editor";
import { blankModeLabel, questionLabel, questionTypeLabel } from "@/lib/format";
import { newBlankQuestion, newQuestion, validateQuestion } from "@/lib/question-defaults";
import { guessSubjectArea, questionTypesFor, subjectAreaLabel } from "@/lib/subjects";
import {
  allQuestions,
  emptyPart,
  insertQuestions,
  moveQuestion,
  quizPaperTotals,
  withPoints,
  withPoolPoints,
  type EditorPart,
  type EditorQuiz,
} from "@/lib/quiz-editor";
import { blankModes, questionTypes } from "@examora/contract";
import type { PaperHeader as Header, Question, QuestionType, QuizSettings, SubjectArea } from "@examora/contract";
import type { Class } from "@/lib/types";
import { ExcelImport } from "./excel-import";
import { OnlinePreview } from "./online-preview";
import { PaperLayout } from "./paper-layout";
import { PartCard, type DeleteMode } from "./part-card";
import { PointsDialog } from "./points-dialog";
import { QuestionEditor } from "./question-editor";
import { saveQuizAction } from "../actions";

export type EditorTab = "questions" | "paper";

type AddOption = { key: string; label: string; make: () => Question };

// What the "Add question" menu offers: blank questions get one entry per mode.
const addOptions = (types: readonly QuestionType[]): AddOption[] =>
  types.flatMap((type): AddOption[] =>
    type === "blank"
      ? blankModes.map((mode) => ({ key: `blank:${mode}`, label: blankModeLabel[mode], make: () => newBlankQuestion(mode) }))
      : [{ key: type, label: questionTypeLabel[type], make: () => newQuestion(type) }],
  );

const partName = (part: EditorPart, index: number) => part.title.trim() || `Part ${index + 1}`;

function validate(a: EditorQuiz): string[] {
  const problems: string[] = [];
  if (!a.title.trim()) problems.push("Add a title.");
  const total = allQuestions(a).length;
  if (total === 0) problems.push("Add at least one question.");
  let number = 0;
  a.parts.forEach((part, i) => {
    const name = partName(part, i);
    if (!part.title.trim()) problems.push(`Part ${i + 1} needs a title.`);
    if (part.questions.length === 0 && total > 0) problems.push(`${name} has no questions. Add one or delete the part.`);
    if (part.poolSize !== null) {
      if (!Number.isInteger(part.poolSize) || part.poolSize < 1)
        problems.push(`${name}: a pool must draw at least 1 question.`);
      else if (part.poolSize > part.questions.length)
        problems.push(`${name} draws ${part.poolSize} questions but has only ${part.questions.length}.`);
      const points = [...new Set(part.questions.map((q) => q.points))];
      if (points.length > 1)
        problems.push(`${name} is a pool, so all its questions need equal points (it has ${points.join(", ")}).`);
    }
    for (const q of part.questions) {
      number += 1;
      const problem = validateQuestion(q);
      if (problem) problems.push(`Question ${number} (${name}) ${problem}`);
    }
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
  // Which part has its question bank or Excel import open, and which has its type menu open.
  const [bankFor, setBankFor] = useState<string | null>(null);
  // New, empty quizzes start with the import open, since that's the fastest way to fill one.
  const [importFor, setImportFor] = useState<string | null>(
    allQuestions(initial).length === 0 ? (initial.parts[0]?.id ?? null) : null,
  );
  const [menuFor, setMenuFor] = useState<string | null>(null);
  // Drag and drop: the question being dragged, and where it would land.
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<{ partId: string; index: number } | null>(null);

  const setSettings = (patch: Partial<QuizSettings>) =>
    setA((prev) => ({ ...prev, settings: { ...prev.settings, ...patch } }));
  const setHeader = (patch: Partial<Header>) =>
    setA((prev) => ({ ...prev, header: { ...prev.header, ...patch } }));
  const setParts = (fn: (parts: EditorPart[]) => EditorPart[]) =>
    setA((prev) => ({ ...prev, parts: fn(prev.parts) }));
  const setPart = (id: string, fn: (part: EditorPart) => EditorPart) =>
    setParts((parts) => parts.map((p) => (p.id === id ? fn(p) : p)));

  const addQuestions = (partId: string, questions: Question[]) =>
    setPart(partId, (p) => insertQuestions(p, questions));

  function movePart(index: number, delta: -1 | 1) {
    setParts((parts) => {
      const next = [...parts];
      [next[index], next[index + delta]] = [next[index + delta]!, next[index]!];
      return next;
    });
  }

  function deletePart(index: number, mode: DeleteMode) {
    setParts((parts) => {
      const gone = parts[index]!;
      const rest = parts.filter((_, i) => i !== index);
      if (mode === "remove" || gone.questions.length === 0) return rest;
      // Into the part before it, at its end; a first part's questions go to the start of the next one.
      const toPrevious = index > 0;
      const targetIndex = toPrevious ? index - 1 : 0;
      return rest.map((p, i) =>
        i === targetIndex ? insertQuestions(p, [...gone.questions], toPrevious ? undefined : 0) : p,
      );
    });
  }

  function setPartPoints(partId: string, points: number) {
    setPart(partId, (p) => ({ ...p, questions: p.questions.map((q) => withPoints(q, points)) }));
  }

  // Questions in pool parts follow their part, so a type's bulk points skip them.
  function setTypePoints(type: QuestionType, points: number) {
    setParts((parts) =>
      parts.map((p) =>
        p.poolSize !== null ? p : { ...p, questions: p.questions.map((q) => (q.type === type ? withPoints(q, points) : q)) },
      ),
    );
  }

  function dropAt(partId: string, index: number) {
    if (dragId) setParts((parts) => moveQuestion(parts, dragId, partId, index));
    setDragId(null);
    setOver(null);
  }

  // Dragging over a question: the top half drops before it, the bottom half after it.
  function dragOverQuestion(e: DragEvent<HTMLElement>, partId: string, index: number) {
    if (!dragId) return;
    e.preventDefault();
    e.stopPropagation();
    const box = e.currentTarget.getBoundingClientRect();
    setOver({ partId, index: e.clientY < box.top + box.height / 2 ? index : index + 1 });
  }

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

  const totals = quizPaperTotals(a);
  const hasPool = a.parts.some((p) => p.poolSize !== null);
  const usedPrompts = new Set(allQuestions(a).map((q) => q.prompt));
  const options = addOptions(showAllTypes ? questionTypes : allowedTypes);
  // Questions are numbered continuously across parts.
  const firstNumber = a.parts.map((_, i) => 1 + a.parts.slice(0, i).reduce((n, p) => n + p.questions.length, 0));

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
                <div>
                  <p className="mb-1.5 text-sm font-medium">Instructions</p>
                  <MarkdownEditor
                    value={a.description}
                    onChange={(description) => setA((prev) => ({ ...prev, description }))}
                    label="Quiz instructions"
                    rows={3}
                  />
                  <p className="mt-1 text-xs text-muted">Shown to students before they start.</p>
                </div>
              </div>
            </Card>

            <section aria-labelledby="questions-heading" className="space-y-4">
              <h2 id="questions-heading" className="font-semibold">
                Parts and questions
              </h2>

              {a.parts.map((part, pi) => {
                const name = partName(part, pi);
                const moveTarget = a.parts[pi - 1] ?? a.parts[pi + 1];
                return (
                  <PartCard
                    key={part.id}
                    part={part}
                    index={pi}
                    count={a.parts.length}
                    moveTarget={moveTarget ? partName(moveTarget, a.parts.indexOf(moveTarget)) : undefined}
                    dropActive={dragId !== null && over?.partId === part.id}
                    onDragOver={(e) => {
                      if (!dragId) return;
                      e.preventDefault();
                      setOver({ partId: part.id, index: part.questions.length });
                    }}
                    onDragLeave={(e) => {
                      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(null);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      dropAt(part.id, over?.partId === part.id ? over.index : part.questions.length);
                    }}
                    onChange={(next) => setPart(part.id, () => next)}
                    onMove={(delta) => movePart(pi, delta)}
                    onDelete={(mode) => deletePart(pi, mode)}
                    footer={
                      <div className="space-y-3">
                        {importFor === part.id && (
                          <ExcelImport
                            hasQuestions={part.questions.length > 0}
                            onImport={(imported, mode) => {
                              setPart(part.id, (p) =>
                                insertQuestions(mode === "replace" ? { ...p, questions: [] } : p, imported),
                              );
                              setImportFor(null);
                              setNotice(null);
                            }}
                          />
                        )}
                        {bankFor === part.id && (
                          <BankPicker
                            bank={showAllTypes ? bank : bank.filter((q) => allowedTypes.includes(q.type))}
                            usedPrompts={usedPrompts}
                            onPick={(q) =>
                              addQuestions(part.id, [{ ...structuredClone(q), id: crypto.randomUUID().slice(0, 8) }])
                            }
                          />
                        )}
                        <div className="rounded-xl border border-dashed border-border p-3">
                          <div className="flex flex-wrap gap-2">
                            <Button
                              variant="secondary"
                              onClick={() => setMenuFor(menuFor === part.id ? null : part.id)}
                              aria-expanded={menuFor === part.id}
                            >
                              <Plus className="size-4" aria-hidden /> Add question
                            </Button>
                            <Button
                              variant="secondary"
                              onClick={() => setBankFor(bankFor === part.id ? null : part.id)}
                              aria-expanded={bankFor === part.id}
                            >
                              <Database className="size-4" aria-hidden /> From question bank
                            </Button>
                            <Button
                              variant="secondary"
                              onClick={() => setImportFor(importFor === part.id ? null : part.id)}
                              aria-expanded={importFor === part.id}
                            >
                              <FileSpreadsheet className="size-4" aria-hidden /> Import from Excel
                            </Button>
                          </div>
                          {menuFor === part.id && (
                            <div className="mt-3">
                              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                <p className="text-sm text-muted">
                                  Add to {name}
                                  {!showAllTypes && <span> · {subjectAreaLabel[area]} question types</span>}
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
                                {options.map((option) => (
                                  <Button
                                    key={option.key}
                                    variant="secondary"
                                    onClick={() => {
                                      addQuestions(part.id, [option.make()]);
                                      setMenuFor(null);
                                    }}
                                  >
                                    <Plus className="size-4" aria-hidden /> {option.label}
                                  </Button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    }
                  >
                    {part.questions.map((q, qi) => {
                      const marker =
                        dragId !== null && over?.partId === part.id
                          ? over.index === qi
                            ? "before"
                            : over.index === qi + 1 && qi === part.questions.length - 1
                              ? "after"
                              : null
                          : null;
                      return (
                        <div
                          key={q.id}
                          id={`question-${q.id}`}
                          onDragOver={(e) => dragOverQuestion(e, part.id, qi)}
                          onDrop={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            dropAt(part.id, over?.partId === part.id ? over.index : qi);
                          }}
                          className={clsx(
                            "rounded-xl",
                            dragId === q.id && "opacity-50",
                            marker === "before" && "border-t-4 border-primary",
                            marker === "after" && "border-b-4 border-primary",
                          )}
                        >
                          <QuestionEditor
                            question={q}
                            number={firstNumber[pi]! + qi}
                            first={qi === 0}
                            last={qi === part.questions.length - 1}
                            poolLocked={part.poolSize !== null}
                            onChange={(next) =>
                              setPart(part.id, (p) =>
                                withPoolPoints({ ...p, questions: p.questions.map((x) => (x.id === q.id ? next : x)) }, next.points),
                              )
                            }
                            onRemove={() =>
                              setPart(part.id, (p) => ({ ...p, questions: p.questions.filter((x) => x.id !== q.id) }))
                            }
                            onMove={(delta) =>
                              setPart(part.id, (p) => {
                                const next = [...p.questions];
                                [next[qi], next[qi + delta]] = [next[qi + delta]!, next[qi]!];
                                return { ...p, questions: next };
                              })
                            }
                            headerExtra={
                              <span className="flex items-center gap-2">
                                <span
                                  draggable
                                  onDragStart={(e) => {
                                    e.dataTransfer.effectAllowed = "move";
                                    e.dataTransfer.setData("text/plain", q.id);
                                    const card = document.getElementById(`question-${q.id}`);
                                    if (card) e.dataTransfer.setDragImage(card, 16, 16);
                                    setDragId(q.id);
                                  }}
                                  onDragEnd={() => {
                                    setDragId(null);
                                    setOver(null);
                                  }}
                                  title="Drag to another place or part"
                                  className="cursor-grab touch-none rounded p-1 text-muted hover:text-foreground active:cursor-grabbing"
                                >
                                  <GripVertical className="size-4" aria-hidden />
                                  <span className="sr-only">Drag to move</span>
                                </span>
                                <label className="flex items-center gap-1 text-xs text-muted">
                                  Move to part
                                  <select
                                    value={part.id}
                                    onChange={(e) => setParts((parts) => moveQuestion(parts, q.id, e.target.value))}
                                    className={clsx(inputBase, "max-w-40 py-1 text-xs")}
                                  >
                                    {a.parts.map((p, i) => (
                                      <option key={p.id} value={p.id}>
                                        {partName(p, i)}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              </span>
                            }
                          />
                        </div>
                      );
                    })}
                  </PartCard>
                );
              })}

              <Button
                variant="secondary"
                onClick={() => setParts((parts) => [...parts, emptyPart("")])}
              >
                <Plus className="size-4" aria-hidden /> Add part
              </Button>
            </section>
          </div>

          <aside className="space-y-6 lg:sticky lg:top-6 lg:self-start">
            <Card>
              <div className="space-y-3 p-5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted">Questions</span>
                  <span className="font-medium tabular-nums">{totals.questionCount}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted">Total points</span>
                  <span className="font-medium tabular-nums">{totals.totalPoints}</span>
                </div>
                {hasPool && (
                  <p className="text-xs text-muted">
                    Counts what each student gets: pools count only the questions they draw (
                    {allQuestions(a).length} written).
                  </p>
                )}
                <ul className="space-y-1 border-t border-border pt-3 text-xs text-muted">
                  {a.parts.map((p, i) => {
                    const t = quizPaperTotals({ parts: [p] });
                    return (
                      <li key={p.id} className="flex justify-between gap-2">
                        <span className="min-w-0 truncate">{partName(p, i)}</span>
                        <span className="shrink-0 tabular-nums">
                          {t.totalPoints} pts · {t.questionCount}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <PointsDialog parts={a.parts} onSetPartPoints={setPartPoints} onSetTypePoints={setTypePoints} />
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
                <Toggle
                  label="Shuffle order of parts"
                  checked={a.settings.shuffleParts}
                  onChange={(v) => setSettings({ shuffleParts: v })}
                />
                <p className="pt-1 text-xs text-muted">
                  Each student gets their own order. Each part can also shuffle its own questions or draw a pool. The
                  schedule, time limit and anti-cheating rules are set when you start a session.
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
                <Markdown className="text-sm">{q.prompt}</Markdown>
                <p className="mt-0.5 text-xs text-muted">
                  {questionLabel(q)} · {q.points} pts{q.topic && ` · ${q.topic}`}
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
