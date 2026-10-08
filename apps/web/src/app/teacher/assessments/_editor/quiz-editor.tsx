"use client";

import { useEffect, useMemo, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Database, FileSpreadsheet, GripVertical, Plus } from "lucide-react";
import { Button, inputBase } from "@/components/ui";
import { Dialog } from "@/components/dialog";
import {
  allQuestions,
  emptyPart,
  insertQuestions,
  moveQuestion,
  partHeading,
  partName,
  roman,
  quizPaperTotals,
  withPoints,
  withPoolPoints,
  type EditorPart,
  type EditorQuiz,
} from "@/lib/quiz-editor";
import { questionTypesFor } from "@/lib/subjects";
import { assetIdsIn, markdownImages } from "@examora/contract";
import { useAssetUrls } from "@/lib/use-asset-urls";
import type { PaperHeader as Header, Question, QuestionType, QuizSettings, SubjectArea } from "@examora/contract";
import type { Class } from "@/lib/types";
import { AddQuestionMenu } from "./add-question-menu";
import { BankPicker } from "./bank-picker";
import { DetailsCard } from "./details-card";
import { EditorHeader, type EditorView } from "./editor-header";
import { ExcelImport } from "./excel-import";
import { EditorAssetUrls } from "./image-field";
import { OnlinePreview } from "./online-preview";
import { PaperLayout } from "./paper-layout";
import { PartSection, type DeleteMode } from "./part-section";
import { PointsDialog } from "./points-dialog";
import { QuestionCard } from "./question-card";
import { TableView } from "./table-view";
import { Toc, tocDomId, type TocTarget } from "./toc";
import { questionProblems, validateQuiz } from "./validate";
import { saveQuizAction } from "../actions";

export type { EditorView };

export function QuizEditor({
  initial,
  classes,
  bank,
  sessionDates,
  initialPaperOpen = false,
  initialView = "cards",
  assetUrls,
}: {
  initial: EditorQuiz;
  classes: Class[];
  bank: readonly Question[];
  // The dates of the quiz's latest session, printed on the paper when the header has none.
  sessionDates: string;
  initialPaperOpen?: boolean;
  initialView?: EditorView;
  // Signed URLs of the pictures the saved quiz already holds.
  assetUrls: Record<string, string>;
}) {
  const router = useRouter();
  const [a, setA] = useState(initial);
  // What was last saved (the page starts over from the server's copy after every save).
  const [baseline, setBaseline] = useState(() => JSON.stringify(initial));
  const dirty = useMemo(() => JSON.stringify(a) !== baseline, [a, baseline]);
  const area: SubjectArea = a.subjectArea ?? "general";
  const allowedTypes: QuestionType[] = questionTypesFor[area];
  // The classes of the quiz's subject, for the course line on the printed paper.
  const subjectClasses = useMemo(() => classes.filter((c) => c.courseCode === a.subject), [classes, a.subject]);
  const [saving, setSaving] = useState(false);
  // Signed URLs of every picture in the quiz, for the previews; pictures added meanwhile are fetched as they appear.
  const imageIds = useMemo(() => [...new Set(assetIdsIn(JSON.stringify(a)))], [a]);
  const { urls } = useAssetUrls(assetUrls, imageIds);
  const [paperOpen, setPaperOpen] = useState(initialPaperOpen);
  const [view, setView] = useState(initialView);
  const [problems, setProblems] = useState<string[]>([]);
  // Which part has its question bank or Excel import open.
  const [bankFor, setBankFor] = useState<string | null>(null);
  const [importFor, setImportFor] = useState<string | null>(null);
  // The question cards that are open for editing; the others show one line.
  const [open, setOpen] = useState<string[]>([]);
  // Drag and drop: the question being dragged, and where it would land.
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<{ partId: string; index: number } | null>(null);
  const [focusRequest, setFocusRequest] = useState<{ id: string; token: number } | null>(null);

  const questionIssues = useMemo(() => questionProblems(a), [a]);
  const detailsProblem = !a.title.trim() || markdownImages(a.description).some((m) => !m.alt.trim());

  // A page with unsaved edits asks before it is left.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const setSettings = (patch: Partial<QuizSettings>) =>
    setA((prev) => ({ ...prev, settings: { ...prev.settings, ...patch } }));
  const setHeader = (patch: Partial<Header>) =>
    setA((prev) => ({ ...prev, header: { ...prev.header, ...patch } }));
  const setParts = (fn: (parts: EditorPart[]) => EditorPart[]) =>
    setA((prev) => ({ ...prev, parts: fn(prev.parts) }));
  const setPart = (id: string, fn: (part: EditorPart) => EditorPart) =>
    setParts((parts) => parts.map((p) => (p.id === id ? fn(p) : p)));

  // New questions open for editing.
  function addQuestions(partId: string, questions: Question[]) {
    setPart(partId, (p) => insertQuestions(p, questions));
    setOpen((ids) => [...ids, ...questions.map((q) => q.id)]);
  }

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

  // The view edits the same quiz; the URL only remembers which one is showing.
  function remember(key: string, value: string | null) {
    const url = new URL(window.location.href);
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
    window.history.replaceState(null, "", url);
  }
  function switchView(next: EditorView) {
    setView(next);
    remember("view", next === "table" ? "table" : null);
  }

  // Scrolls to what the contents list names, opening a question's card (or focusing its table row) on the way.
  function go(target: TocTarget) {
    if (target.kind === "question") {
      if (view === "cards") setOpen((ids) => (ids.includes(target.id) ? ids : [...ids, target.id]));
      else setFocusRequest({ id: target.id, token: Date.now() });
    }
    // After the render that opens the card, so the scroll lands on its final place.
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        document
          .getElementById(tocDomId(target))
          ?.scrollIntoView({ behavior: "smooth", block: target.kind === "question" && view === "table" ? "center" : "start" }),
      ),
    );
  }

  function addPart() {
    const part = emptyPart("");
    setParts((parts) => [...parts, part]);
    go({ kind: "part", id: part.id });
  }

  async function save() {
    const found = validateQuiz(a);
    setProblems(found);
    if (found.length) return;
    setSaving(true);
    // (A new quiz is redirected to its own edit page by the action.)
    const result = await saveQuizAction(a);
    setSaving(false);
    if ("error" in result) {
      setProblems([result.error]);
      return;
    }
    // Reload the page, so the editor starts again from what the server saved (part ids included).
    setBaseline(JSON.stringify(a));
    router.refresh();
  }

  const totals = quizPaperTotals(a);
  const hasPool = a.parts.some((p) => p.poolSize !== null);
  const usedPrompts = new Set(allQuestions(a).map((q) => q.prompt));
  // Questions are numbered continuously across parts.
  const firstNumber = a.parts.map((_, i) => 1 + a.parts.slice(0, i).reduce((n, p) => n + p.questions.length, 0));
  const everyId = allQuestions(a).map((q) => q.id);

  const toc = (
    <Toc
      parts={a.parts}
      problems={questionIssues}
      detailsProblem={detailsProblem}
      area={area}
      showExpand={view === "cards"}
      onExpandAll={() => setOpen(everyId)}
      onCollapseAll={() => setOpen([])}
      onGo={go}
      onAddPart={addPart}
      onAddQuestion={(partId, q) => {
        addQuestions(partId, [q]);
        go({ kind: "question", id: q.id });
      }}
    />
  );

  return (
    <EditorAssetUrls value={urls}>
      <EditorHeader
        quizId={a.id}
        title={a.title}
        totals={{ parts: a.parts.length, questions: allQuestions(a).length, points: totals.totalPoints }}
        view={view}
        state={saving ? "saving" : dirty ? "unsaved" : "saved"}
        onView={switchView}
        onSave={save}
      />

      {problems.length > 0 && (
        <ul role="alert" className="mb-5 space-y-1 rounded-lg bg-danger-soft p-3 text-sm text-danger">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}

        <div className="pb-28">
          {toc}
          <div className="w-full min-w-0 space-y-8">
            <DetailsCard
              quiz={a}
              classes={classes}
              onOpenPaper={() => setPaperOpen(true)}
              onSettings={setSettings}
              onDetails={(d) =>
                setA((prev) => {
                  // eslint-disable-next-line @typescript-eslint/no-unused-vars
                  const { subject: _previous, ...rest } = prev;
                  return { ...rest, title: d.title, description: d.description, subjectArea: d.subjectArea, ...(d.subject ? { subject: d.subject } : {}) };
                })
              }
            />

            <section aria-labelledby="questions-heading" className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 id="questions-heading" className="text-lg font-semibold">
                    Parts and questions
                  </h2>
                  {hasPool && (
                    <p className="text-xs text-muted">
                      Totals count what each student gets: pools count only the questions they draw ({allQuestions(a).length}{" "}
                      written).
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  <PointsDialog parts={a.parts} onSetPartPoints={setPartPoints} onSetTypePoints={setTypePoints} />
                  <OnlinePreview assessment={a} classes={subjectClasses} />
                </div>
              </div>

              {view === "table" ? (
                <TableView
                  parts={a.parts}
                  area={area}
                  problems={questionIssues}
                  focusRequest={focusRequest}
                  onPartsChange={(next) => setParts(() => next)}
                />
              ) : (
                a.parts.map((part, pi) => {
                  const moveTarget = a.parts[pi - 1] ?? a.parts[pi + 1];
                  return (
                    <div key={part.id} className={clsx("space-y-8", pi > 0 && "mt-10")}>
                      {pi > 0 && (
                        <div role="separator" aria-label={partHeading(part.title, pi + 1)} className="flex items-center gap-3 pb-2 pt-4 text-sm font-semibold text-muted">
                          <hr aria-hidden className="flex-1 border-t-2 border-border" />
                          <span>— {partHeading(part.title, pi + 1)} —</span>
                          <hr aria-hidden className="flex-1 border-t-2 border-border" />
                        </div>
                      )}
                      <PartSection
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
                        actions={<AddQuestionMenu area={area} onAdd={(q) => addQuestions(part.id, [q])} />}
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
                                }}
                              />
                            )}
                            {bankFor === part.id && (
                              <BankPicker
                                bank={bank}
                                types={allowedTypes}
                                usedPrompts={usedPrompts}
                                onPick={(q) =>
                                  addQuestions(part.id, [{ ...structuredClone(q), id: crypto.randomUUID().slice(0, 8) }])
                                }
                              />
                            )}
                            <div className="flex flex-wrap gap-2 rounded-xl border border-dashed border-border p-3">
                              <AddQuestionMenu area={area} onAdd={(q) => addQuestions(part.id, [q])} />
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
                                "scroll-mt-24 rounded-xl",
                                dragId === q.id && "opacity-50",
                                marker === "before" && "border-t-4 border-primary",
                                marker === "after" && "border-b-4 border-primary",
                              )}
                            >
                              <QuestionCard
                                question={q}
                                number={firstNumber[pi]! + qi}
                                expanded={open.includes(q.id)}
                                onToggle={() =>
                                  setOpen((ids) => (ids.includes(q.id) ? ids.filter((id) => id !== q.id) : [...ids, q.id]))
                                }
                                problem={questionIssues.get(q.id)}
                                poolLocked={part.poolSize !== null}
                                onChange={(next) =>
                                  setPart(part.id, (p) =>
                                    withPoolPoints({ ...p, questions: p.questions.map((x) => (x.id === q.id ? next : x)) }, next.points),
                                  )
                                }
                                onRemove={() =>
                                  setPart(part.id, (p) => ({ ...p, questions: p.questions.filter((x) => x.id !== q.id) }))
                                }
                                headerExtra={
                                  <>
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
                                    <select
                                      value={part.id}
                                      onChange={(e) => setParts((parts) => moveQuestion(parts, q.id, e.target.value))}
                                      aria-label={`Move question ${firstNumber[pi]! + qi} to part`}
                                      title="Move to part"
                                      className={clsx(inputBase, "max-w-44 py-1 text-xs")}
                                    >
                                      {a.parts.map((p, i) => (
                                        <option key={p.id} value={p.id}>
                                          {roman(i + 1)}. {partName(p, i)}
                                        </option>
                                      ))}
                                    </select>
                                  </>
                                }
                              />
                            </div>
                          );
                        })}
                      </PartSection>
                    </div>
                  );
                })
              )}

              <Button variant="secondary" onClick={addPart}>
                <Plus className="size-4" aria-hidden /> Add part
              </Button>
            </section>
          </div>
        </div>
      <Dialog
        open={paperOpen}
        onClose={() => setPaperOpen(false)}
        title="Test paper layout"
        description="The printed header, paper settings and a live preview. Changes save with the quiz."
        size="xl"
        footer={<Button onClick={() => setPaperOpen(false)}>Done</Button>}
      >
        <PaperLayout
          assessment={a}
          classes={subjectClasses}
          sessionDates={sessionDates}
          assetUrls={urls}
          onHeaderChange={setHeader}
          onPaperChange={(patch) => setA((prev) => ({ ...prev, paper: { ...prev.paper, ...patch } }))}
        />
      </Dialog>
    </EditorAssetUrls>
  );
}
