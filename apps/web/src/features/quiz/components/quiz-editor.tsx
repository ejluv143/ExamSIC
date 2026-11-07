"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Calculator, Database, Eye, FileSpreadsheet, GripVertical, Pencil, Plus, Printer, TriangleAlert } from "lucide-react";
import type { BankQuestion } from "@examinus/contract/bank";
import { topicsOf } from "@/features/bank/model";
import { Button } from "@/components/ui";
import { Dialog } from "@/components/dialog";
import { allQuestions, emptyPart, firstNumbers, quizPaperTotals, type EditorQuiz } from "@/features/quiz/quiz-editor";
import { partHeading, partMenuLabel, partName } from "@examinus/copy/paper";
import { questionTypesFor } from "@examinus/domain/kinds";
import { assetIdsIn } from "@examinus/domain/asset";
import { useAssetUrls } from "@/features/assets/use-asset-urls";
import type { AiOption } from "@examinus/contract/ai";
import type { Question, QuestionType } from "@examinus/domain/question";
import type { PaperHeader, QuizSettings } from "@examinus/domain/quiz";
import type { SubjectArea } from "@examinus/domain/roles";
import type { Class } from "@/features/classes/types";
import { aiStatusAction } from "@/features/ai/actions";
import { AiGenerate } from "@/features/ai/components/ai-generate";
import { AddQuestionMenu } from "./add-question-menu";
import { BankPicker } from "./bank-picker";
import { EditorTopics } from "./editor-topics";
import { EditorHeader, type EditorView } from "./editor-header";
import { ExcelImport } from "./excel-import";
import { EditorAssetUrls } from "@/components/question-kinds/shared/editor-image-field";
import { OnlinePreview } from "./online-preview";
import { DetailsStrip } from "./details-strip";
import { PaperLayout } from "./paper-layout";
import { PartSection } from "./part-section";
import { PointsDialog } from "./points-dialog";
import { QuestionEditorDialog } from "./question-editor-dialog";
import { QuestionRow } from "./question-row";
import { QuizDetailsDialog } from "./quiz-details-dialog";
import { TableView } from "./table-view";
import { Toc, tocDomId, type TocTarget } from "./toc";
import * as edit from "../quiz-editing";
import { useQuestionDrag } from "../use-question-drag";
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
  bank: readonly BankQuestion[];
  // The dates of the quiz's latest session, printed on the paper when the header has none.
  sessionDates: string;
  initialPaperOpen?: boolean;
  initialView?: EditorView;
  // Signed URLs of the pictures the saved quiz already holds.
  assetUrls: Record<string, string>;
}) {
  const router = useRouter();
  // The quiz being edited, with what the editing module tracks about it (saved copy, questions not yet kept).
  const [state, setState] = useState(() => edit.startEditing(initial));
  const a = state.quiz;
  const dirty = useMemo(() => edit.isDirty(state), [state]);
  const area: SubjectArea = a.subjectArea ?? "general";
  const allowedTypes: QuestionType[] = questionTypesFor[area];
  // The classes of the quiz's subject, for the course line on the printed paper.
  const topics = useMemo(() => topicsOf(bank), [bank]);
  const subjectClasses = useMemo(() => classes.filter((c) => c.courseCode === a.subject), [classes, a.subject]);
  const [saving, setSaving] = useState(false);
  // Signed URLs of every picture in the quiz, for the previews; pictures added meanwhile are fetched as they appear.
  const imageIds = useMemo(() => [...new Set(assetIdsIn(JSON.stringify(a)))], [a]);
  const { urls } = useAssetUrls(assetUrls, imageIds);
  const [paperOpen, setPaperOpen] = useState(initialPaperOpen);
  const [view, setView] = useState(initialView);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [pointsOpen, setPointsOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  // The part the teacher last worked in: the page-level "Add question", "Question bank" and "Import from Excel" go there.
  const [activePartId, setActivePartId] = useState<string | null>(null);
  // Which part has its question bank or Excel import open.
  const [bankFor, setBankFor] = useState<string | null>(null);
  const [importFor, setImportFor] = useState<string | null>(null);
  // The question open in the question editor window.
  const [editingId, setEditingId] = useState<string | null>(null);
  // Drag and drop: the question being dragged, and where it would land.
  const [focusRequest, setFocusRequest] = useState<{ id: string; token: number } | null>(null);
  // The AI providers the teacher can use (null while loading).
  const [aiOptions, setAiOptions] = useState<readonly AiOption[] | null>(null);
  useEffect(() => {
    aiStatusAction().then(setAiOptions, () => setAiOptions([]));
  }, []);

  const questionIssues = useMemo(() => edit.questionProblems(a), [a]);
  const detailsProblem = edit.hasDetailsProblem(a);

  // A page with unsaved edits asks before it is left.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const setSettings = (patch: Partial<QuizSettings>) => setState((s) => edit.setSettings(s, patch));
  const setHeader = (patch: Partial<PaperHeader>) => setState((s) => edit.setHeader(s, patch));

  // A new question opens in the question editor (a batch, e.g. from the AI, just lands in the part).
  function addQuestions(partId: string, questions: Question[]) {
    setState((s) => edit.addQuestions(s, partId, questions));
    setActivePartId(partId);
    if (questions.length === 1) setEditingId(questions[0]!.id);
  }

  const drag = useQuestionDrag((questionId, partId, index) => setState((s) => edit.moveQuestionTo(s, questionId, partId, index)));

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

  // Scrolls to what the contents list names; a question also opens in the question editor (or, in the table,
  // takes the focus of its row).
  function go(target: TocTarget) {
    if (target.kind === "question") {
      if (view === "cards") setEditingId(target.id);
      else setFocusRequest({ id: target.id, token: Date.now() });
    }
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
    setState((s) => edit.addPart(s, part));
    setActivePartId(part.id);
    go({ kind: "part", id: part.id });
  }

  async function save() {
    const input = edit.forSave(state);
    setProblems("problems" in input ? input.problems : []);
    if ("problems" in input) return;
    setSaving(true);
    // (A new quiz is redirected to its own edit page by the action.)
    const result = await saveQuizAction(input.quiz);
    setSaving(false);
    if ("error" in result) {
      setProblems([result.error]);
      return;
    }
    // Reload the page, so the editor starts again from what the server saved (part ids included).
    setState((s) => edit.markSaved(s, input.quiz));
    router.refresh();
  }

  const totals = quizPaperTotals(a);
  const hasPool = a.parts.some((p) => p.poolSize !== null);
  const usedPrompts = new Set(allQuestions(a).map((q) => q.prompt));
  const firstNumber = firstNumbers(a);
  const questionCount = allQuestions(a).length;
  const targetPart = a.parts.find((p) => p.id === activePartId) ?? a.parts[a.parts.length - 1]!;

  // The question open in the editor window, with where it sits.
  const editingPart = editingId ? a.parts.findIndex((p) => p.questions.some((q) => q.id === editingId)) : -1;
  const editingIndex = editingPart < 0 ? -1 : a.parts[editingPart]!.questions.findIndex((q) => q.id === editingId);
  const editingRow =
    editingPart < 0
      ? null
      : {
          question: a.parts[editingPart]!.questions[editingIndex]!,
          part: a.parts[editingPart]!,
          index: editingPart,
          number: firstNumber[editingPart]! + editingIndex,
        };

  // The floating contents pill only earns its place in a longer quiz.
  const showToc = view === "cards" && (a.parts.length >= 2 || questionCount >= 8);
  const importPart = a.parts.find((p) => p.id === importFor);
  const bankPart = a.parts.find((p) => p.id === bankFor);
  const toc = (
    <Toc
      parts={a.parts}
      problems={questionIssues}
      detailsProblem={detailsProblem}
      area={area}
      onGo={go}
      onAddPart={addPart}
      onAddQuestion={(partId, q) => addQuestions(partId, [q])}
    />
  );

  return (
    <EditorAssetUrls value={urls}>
      <EditorTopics value={topics}>
        <EditorHeader
          quizId={a.id}
          title={a.title}
          totals={{ parts: a.parts.length, questions: questionCount, points: totals.totalPoints }}
          view={view}
          state={saving ? "saving" : dirty ? "unsaved" : "saved"}
          onView={switchView}
          onSave={save}
          onPaper={() => setPaperOpen(true)}
          items={[
            { label: "Preview exam", icon: Eye, onSelect: () => setPreviewOpen(true) },
            { label: "Paper layout", icon: Printer, onSelect: () => setPaperOpen(true) },
            { label: "Edit details", icon: Pencil, onSelect: () => setDetailsOpen(true) },
            { label: "Set points in bulk", icon: Calculator, onSelect: () => setPointsOpen(true) },
            { label: "Import from Excel", icon: FileSpreadsheet, onSelect: () => setImportFor(targetPart.id) },
            { label: "Question bank", icon: Database, onSelect: () => setBankFor(targetPart.id) },
          ]}
        />

        {problems.length > 0 && (
          <div role="alert" className="mb-5 flex items-start gap-3 rounded-xl border border-danger bg-danger-soft p-4 text-sm text-danger">
            <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
            <div>
              <p className="font-bold">Fix {problems.length === 1 ? "this" : "these"} before saving</p>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <div className={showToc ? "pb-28" : undefined}>
          {showToc && toc}
          <div className="w-full min-w-0 space-y-6">
            <DetailsStrip
              quiz={a}
              classes={classes}
              totals={{ parts: a.parts.length, questions: questionCount, points: totals.totalPoints }}
              onEditDetails={() => setDetailsOpen(true)}
              onSettings={setSettings}
            />

            {hasPool && (
              <p className="text-xs text-muted">
                Totals count what each student gets: pools count only the questions they draw ({questionCount} written).
              </p>
            )}

            {view === "table" ? (
              <TableView
                state={state}
                area={area}
                problems={questionIssues}
                focusRequest={focusRequest}
                onChange={setState}
              />
            ) : (
              <div className="space-y-6">
                {a.parts.map((part, pi) => {
                  const moveTarget = a.parts[pi - 1] ?? a.parts[pi + 1];
                  return (
                    <div
                      key={part.id}
                      onPointerDownCapture={() => setActivePartId(part.id)}
                      onFocusCapture={() => setActivePartId(part.id)}
                    >
                      <PartSection
                        part={part}
                        index={pi}
                        count={a.parts.length}
                        moveTarget={moveTarget ? partName(moveTarget.title, a.parts.indexOf(moveTarget) + 1) : undefined}
                        dropActive={drag.activeIn(part.id)}
                        onDragOver={(e) => drag.overPart(e, part.id, part.questions.length)}
                        onDragLeave={drag.leavePart}
                        onDrop={(e) => drag.drop(e, part.id, part.questions.length)}
                        onChange={(next) => setState((s) => edit.updatePart(s, part.id, next))}
                        onPool={(on) => setState((s) => edit.setPool(s, part.id, on))}
                        onPoolPoints={(points) => setState((s) => edit.setPoolPoints(s, part.id, points))}
                        onMove={(delta) => setState((s) => edit.movePart(s, pi, delta))}
                        onDelete={(mode) => setState((s) => edit.deletePart(s, pi, mode))}
                        footer={
                          <div className="flex flex-wrap items-center gap-2">
                            <AddQuestionMenu
                              area={area}
                              variant="primary"
                              className="min-h-11"
                              onAdd={(q) => addQuestions(part.id, [q])}
                            />
                            {aiOptions && aiOptions.length > 0 && (
                              <AiGenerate
                                options={aiOptions}
                                description="The AI drafts the questions; review and edit them before you save the quiz."
                                onAdd={(qs) => addQuestions(part.id, qs)}
                              />
                            )}
                          </div>
                        }
                      >
                        {part.questions.map((q, qi) => {
                          const marker = drag.marker(part.id, qi, part.questions.length);
                          const number = firstNumber[pi]! + qi;
                          return (
                            <div
                              key={q.id}
                              id={`question-${q.id}`}
                              onDragOver={(e) => drag.overQuestion(e, part.id, qi)}
                              onDrop={(e) => drag.drop(e, part.id, qi)}
                              className={clsx(
                                "scroll-mt-40",
                                drag.dragId === q.id && "opacity-50",
                                marker === "before" && "border-t-4 border-primary",
                                marker === "after" && "border-b-4 border-primary",
                              )}
                            >
                              <QuestionRow
                                question={q}
                                number={number}
                                problem={questionIssues.get(q.id)}
                                moveTargets={a.parts.flatMap((p, i) =>
                                  p.id === part.id
                                    ? []
                                    : [
                                        {
                                          label: partMenuLabel(p.title, i + 1),
                                          onSelect: () => setState((s) => edit.moveQuestionTo(s, q.id, p.id)),
                                        },
                                      ],
                                )}
                                canMove={{ up: qi > 0, down: qi < part.questions.length - 1 }}
                                // Within a part the new place is an index among its questions; moving down lands after the next one.
                                onMove={(delta) =>
                                  setState((s) => edit.moveQuestionTo(s, q.id, part.id, delta < 0 ? qi - 1 : qi + 2))
                                }
                                onEdit={() => setEditingId(q.id)}
                                onDuplicate={() => setState((s) => edit.duplicateQuestion(s, part.id, qi))}
                                onRemove={() => setState((s) => edit.removeQuestion(s, q.id))}
                                leading={
                                  <span
                                    draggable
                                    onClick={(e) => e.stopPropagation()}
                                    onDragStart={(e) => drag.start(e, q.id, document.getElementById(`question-${q.id}`))}
                                    onDragEnd={drag.end}
                                    title="Drag to another place or part"
                                    className="-ml-1 grid size-9 shrink-0 cursor-grab touch-none place-items-center rounded-lg text-muted hover:bg-surface-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary active:cursor-grabbing"
                                  >
                                    <GripVertical className="size-5" aria-hidden />
                                    <span className="sr-only">Drag to move</span>
                                  </span>
                                }
                              />
                            </div>
                          );
                        })}
                      </PartSection>
                    </div>
                  );
                })}
              </div>
            )}

            <button
              type="button"
              onClick={addPart}
              className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-surface/60 px-4 py-3 text-sm font-semibold text-primary motion-safe:transition-colors hover:border-primary hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <Plus className="size-5" aria-hidden /> Add part
            </button>
          </div>
        </div>

        <OnlinePreview assessment={a} classes={subjectClasses} open={previewOpen} onClose={() => setPreviewOpen(false)} />

        <PointsDialog
          parts={a.parts}
          open={pointsOpen}
          onClose={() => setPointsOpen(false)}
          onSetPartPoints={(partId, points) => setState((s) => edit.setPartPoints(s, partId, points))}
          onSetTypePoints={(type, points) => setState((s) => edit.setTypePoints(s, type, points))}
        />

        <QuizDetailsDialog
          open={detailsOpen}
          onClose={() => setDetailsOpen(false)}
          classes={classes}
          title="Quiz details"
          submitLabel="Save details"
          assetUrls={urls}
          initial={{
            title: a.title,
            description: a.description,
            ...(a.subject ? { subject: a.subject } : {}),
            subjectArea: area,
          }}
          onSubmit={(d) => setState((s) => edit.setTitleAndSubject(s, d))}
        />

        <Dialog
          open={importPart !== undefined}
          onClose={() => setImportFor(null)}
          title="Import from Excel"
          description={importPart ? `Questions go into ${partName(importPart.title, a.parts.indexOf(importPart) + 1)}.` : undefined}
          size="lg"
        >
          {importPart && (
            <ExcelImport
              hasQuestions={importPart.questions.length > 0}
              onImport={(imported, mode) => {
                setState((s) => edit.importQuestions(s, importPart.id, imported, mode));
                setImportFor(null);
              }}
            />
          )}
        </Dialog>

        <Dialog
          open={bankPart !== undefined}
          onClose={() => setBankFor(null)}
          title="Question bank"
          description={bankPart ? `Picked questions go into ${partName(bankPart.title, a.parts.indexOf(bankPart) + 1)}.` : undefined}
          size="lg"
        >
          {bankPart && (
            <BankPicker
              bank={bank}
              types={allowedTypes}
              usedPrompts={usedPrompts}
              onPick={(q) => {
                setBankFor(null);
                addQuestions(bankPart.id, [edit.copyOf(q)]);
              }}
            />
          )}
        </Dialog>

        <QuestionEditorDialog
          question={editingRow?.question ?? null}
          number={editingRow?.number ?? 0}
          location={editingRow ? `${partHeading(editingRow.part.title, editingRow.index + 1)} · Q${editingRow.number}` : ""}
          poolLocked={editingRow?.part.poolSize != null}
          onSave={(next) => {
            setState((s) => edit.saveQuestion(s, next));
            setEditingId(null);
          }}
          onClose={() => {
            if (editingId) setState((s) => edit.cancelQuestion(s, editingId));
            setEditingId(null);
          }}
        />

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
            onPaperChange={(patch) => setState((s) => edit.setPaper(s, patch))}
          />
        </Dialog>
      </EditorTopics>
    </EditorAssetUrls>
  );
}
