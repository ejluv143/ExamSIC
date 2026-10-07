"use client";

import { Fragment, useEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent, type ReactNode } from "react";
import clsx from "clsx";
import { ArrowDown, ArrowUp, GripVertical, Pencil, Trash2, TriangleAlert, X } from "lucide-react";
import { Dialog } from "@/components/dialog";
import { Badge, Button, inputBase } from "@/components/ui";
import { questionTypeLabel } from "@/lib/format";
import {
  answerSummary,
  moveQuestion,
  partHeading,
  partName,
  partTotals,
  plainText,
  roman,
  type EditorPart,
} from "@/lib/quiz-editor";
import type { Question, SubjectArea } from "@examora/contract";
import { AddQuestionMenu } from "./add-question-menu";
import { QuestionFields } from "./question-fields";
import {
  applyCell,
  cellEditable,
  cellText,
  colLabel,
  dataCols,
  gameLabel,
  replaceQuestion,
  selectCols,
  stepQuestion,
  type Col,
} from "./table-model";

type Row = { q: Question; part: EditorPart; pi: number; qi: number; number: number };
type Cell = { id: string; col: Col };
type Edit = Cell & { value: string };

const cellBase = "border-b border-r border-border px-2 py-1.5 align-top text-sm";
const th = "sticky top-0 z-20 border-b border-r border-border bg-surface-muted px-2 py-2 text-left text-xs font-medium tracking-wide text-muted uppercase";

// Whether a cell is edited with a dropdown rather than typed text.
const isSelect = (q: Question, col: Col) => selectCols.includes(col) || (col === "answer" && q.type === "true_false");

// The quiz as spreadsheets: one table per part, a row per question. Click or press Enter on a cell to edit it,
// Esc to cancel, Enter to commit and move down (on into the next part), Tab and the arrow keys to move around, and
// paste columns from Excel or Sheets. Everything goes into the same quiz the cards edit.
export function TableView({
  parts,
  area,
  problems,
  focusRequest,
  onPartsChange,
}: {
  parts: EditorPart[];
  area: SubjectArea;
  problems: Map<string, string>;
  // Set when the contents list jumps to a question: its row's cell takes the focus.
  focusRequest: { id: string; token: number } | null;
  onPartsChange: (parts: EditorPart[]) => void;
}) {
  // Holds every part's table: cells are found here by their data-cell name.
  const gridRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<Cell | null>(null);
  const [editing, setEditing] = useState<Edit | null>(null);
  // The edit as the event handlers see it right now, so a commit never runs twice for one edit.
  const editRef = useRef<Edit | null>(null);
  const pendingFocus = useRef<Cell | null>(null);
  const pointer = useRef(false);
  const [selected, setSelected] = useState<string[]>([]);
  const anchor = useRef<string | null>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [panelId, setPanelId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<{ partId: string; index: number } | null>(null);
  const [bulk, setBulk] = useState({ points: "", game: "", part: "" });

  const rows = useMemo<Row[]>(() => {
    let n = 0;
    return parts.flatMap((part, pi) => part.questions.map((q, qi) => ({ q, part, pi, qi, number: ++n })));
  }, [parts]);
  const rowById = useMemo(() => new Map(rows.map((r) => [r.q.id, r])), [rows]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const handledRequest = useRef(0);

  // Focus a cell once it is on screen (after the render that made it so).
  useEffect(() => {
    // A jump from the contents list moves the focus to that question's prompt cell.
    if (focusRequest && focusRequest.token !== handledRequest.current && rowById.has(focusRequest.id)) {
      handledRequest.current = focusRequest.token;
      pendingFocus.current = { id: focusRequest.id, col: "prompt" };
    }
    const target = pendingFocus.current;
    pendingFocus.current = null;
    if (!target) return;
    const el = gridRef.current?.querySelector<HTMLElement>(`[data-cell="${CSS.escape(`${target.id}:${target.col}`)}"]`);
    el?.focus();
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  });

  const setEdit = (e: Edit | null) => {
    editRef.current = e;
    setEditing(e);
  };

  function focusCell(cell: Cell) {
    pendingFocus.current = cell;
    setActive(cell);
  }

  // Moves to a neighbouring cell. Returns false at the edge of the table.
  function go(from: Cell, dx: number, dy: number, wrap = false): boolean {
    let ri = rows.findIndex((r) => r.q.id === from.id);
    let ci = dataCols.indexOf(from.col);
    ci += dx;
    ri += dy;
    if (wrap && ci >= dataCols.length) {
      ci = 0;
      ri += 1;
    } else if (wrap && ci < 0) {
      ci = dataCols.length - 1;
      ri -= 1;
    }
    if (ri < 0 || ri >= rows.length || ci < 0 || ci >= dataCols.length) return false;
    focusCell({ id: rows[ri]!.q.id, col: dataCols[ci]! });
    return true;
  }

  function startEdit(cell: Cell, initial?: string) {
    const row = rowById.get(cell.id);
    if (!row) return;
    if (!cellEditable(row.q, cell.col, row.part.poolSize !== null)) {
      if (cell.col === "answer") setPanelId(cell.id);
      return;
    }
    setEdit({ ...cell, value: initial ?? cellText(row.q, cell.col) });
  }

  function report(text: string, error = false) {
    setMessage({ text, error });
  }

  // Puts the edited text into the quiz. `move` says where the focus goes next.
  function commit(move: "down" | "right" | "left" | "stay" | null) {
    const e = editRef.current;
    if (!e) return;
    setEdit(null);
    const row = rowById.get(e.id);
    if (row && e.value !== cellText(row.q, e.col)) {
      const result = applyCell(parts, e.id, e.col, e.value);
      if ("error" in result) report(result.error, true);
      else {
        onPartsChange(result.parts);
        setMessage(null);
      }
    }
    const moved =
      move === "down" ? go(e, 0, 1) : move === "right" ? go(e, 1, 0, true) : move === "left" ? go(e, -1, 0, true) : false;
    if (move && !moved) focusCell(e);
  }

  function cancel() {
    const e = editRef.current;
    setEdit(null);
    if (e) focusCell(e);
  }

  function onCellKeyDown(e: KeyboardEvent<HTMLElement>, cell: Cell) {
    if (e.target !== e.currentTarget) return;
    const row = rowById.get(cell.id)!;
    const key = e.key;
    if (e.altKey && (key === "ArrowUp" || key === "ArrowDown")) {
      e.preventDefault();
      onPartsChange(stepQuestion(parts, cell.id, key === "ArrowUp" ? -1 : 1));
      focusCell(cell);
      return;
    }
    if (e.ctrlKey || e.metaKey) return;
    switch (key) {
      case "ArrowUp":
        e.preventDefault();
        go(cell, 0, -1);
        return;
      case "ArrowDown":
        e.preventDefault();
        go(cell, 0, 1);
        return;
      case "ArrowLeft":
        e.preventDefault();
        go(cell, -1, 0);
        return;
      case "ArrowRight":
        e.preventDefault();
        go(cell, 1, 0);
        return;
      case "Tab":
        if (go(cell, e.shiftKey ? -1 : 1, 0, true)) e.preventDefault();
        return;
      case "Home":
        e.preventDefault();
        focusCell({ id: cell.id, col: dataCols[0]! });
        return;
      case "End":
        e.preventDefault();
        focusCell({ id: cell.id, col: dataCols[dataCols.length - 1]! });
        return;
      case "Enter":
      case "F2":
        e.preventDefault();
        startEdit(cell);
        return;
      case " ":
        if (cell.col === "partial") {
          e.preventDefault();
          const result = applyCell(parts, cell.id, "partial", row.q.partialCredit ? "no" : "yes");
          if ("parts" in result) onPartsChange(result.parts);
        }
        return;
      case "Delete":
      case "Backspace":
        if (cell.col === "topic") {
          e.preventDefault();
          const result = applyCell(parts, cell.id, "topic", "");
          if ("parts" in result) onPartsChange(result.parts);
        }
        return;
    }
    // Typing on a text cell starts editing it with what was typed.
    if (key.length === 1 && !isSelect(row.q, cell.col) && cellEditable(row.q, cell.col, row.part.poolSize !== null)) {
      e.preventDefault();
      startEdit(cell, key);
    }
  }

  function onEditKeyDown(e: KeyboardEvent<HTMLElement>) {
    const multiline = e.currentTarget instanceof HTMLTextAreaElement;
    if (e.key === "Enter" && !(multiline && e.shiftKey)) {
      e.preventDefault();
      commit("down");
    } else if (e.key === "Tab") {
      e.preventDefault();
      commit(e.shiftKey ? "left" : "right");
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      cancel();
    }
  }

  // Pasting from Excel or Sheets: rows go down the table, tab-separated columns across the editable cells.
  function onPaste(e: ClipboardEvent<HTMLElement>) {
    if (editRef.current || !active) return;
    const raw = e.clipboardData.getData("text/plain");
    if (!raw) return;
    e.preventDefault();
    const grid = raw
      .replace(/\r\n?/g, "\n")
      .replace(/\n$/, "")
      .split("\n")
      .map((line) =>
        line.split("\t").map((v) => (v.length > 1 && v.startsWith('"') && v.endsWith('"') ? v.slice(1, -1).replace(/""/g, '"') : v)),
      );
    const targets: { id: string; col: Col; value: string }[] = [];
    const c0 = dataCols.indexOf(active.col);
    if (grid.length === 1 && grid[0]!.length === 1 && selected.length > 1) {
      for (const id of selected) targets.push({ id, col: active.col, value: grid[0]![0]! });
    } else {
      const r0 = rows.findIndex((r) => r.q.id === active.id);
      grid.forEach((line, i) => {
        const row = rows[r0 + i];
        if (!row) return;
        line.forEach((value, j) => {
          const col = dataCols[c0 + j];
          if (col) targets.push({ id: row.q.id, col, value });
        });
      });
    }
    let next = parts;
    let done = 0;
    let firstError: string | null = null;
    let skipped = 0;
    for (const t of targets) {
      const row = rowById.get(t.id);
      if (!row || !cellEditable(row.q, t.col, row.part.poolSize !== null)) {
        skipped += 1;
        continue;
      }
      const result = applyCell(next, t.id, t.col, t.value);
      if ("error" in result) {
        skipped += 1;
        firstError ??= result.error;
      } else {
        next = result.parts;
        done += 1;
      }
    }
    if (done > 0) onPartsChange(next);
    report(
      `Pasted ${done} ${done === 1 ? "cell" : "cells"}.${skipped ? ` ${skipped} skipped${firstError ? `: ${firstError}` : "."}` : ""}`,
      skipped > 0,
    );
  }

  function toggleRow(id: string, shift: boolean) {
    if (shift && anchor.current) {
      const a = rows.findIndex((r) => r.q.id === anchor.current);
      const b = rows.findIndex((r) => r.q.id === id);
      const range = rows.slice(Math.min(a, b), Math.max(a, b) + 1).map((r) => r.q.id);
      setSelected([...new Set([...selected, ...range])]);
    } else setSelected(selectedSet.has(id) ? selected.filter((x) => x !== id) : [...selected, id]);
    anchor.current = id;
  }

  function applyBulk(col: Col, value: string) {
    let next = parts;
    let firstError: string | null = null;
    for (const id of selected) {
      const result = applyCell(next, id, col, value);
      if ("error" in result) firstError ??= result.error;
      else next = result.parts;
    }
    onPartsChange(next);
    if (firstError) report(firstError, true);
    else report(`${colLabel[col]} set for ${selected.length} ${selected.length === 1 ? "question" : "questions"}.`);
  }

  function moveSelected(partId: string) {
    const name = parts.find((p) => p.id === partId);
    onPartsChange(selected.reduce((next, id) => moveQuestion(next, id, partId), parts));
    report(`Moved ${selected.length} ${selected.length === 1 ? "question" : "questions"} to ${name ? partName(name, parts.indexOf(name)) : "the part"}.`);
  }

  function removeQuestion(id: string) {
    const row = rowById.get(id);
    if (!row) return;
    const neighbour = rows[rows.indexOf(row) + 1] ?? rows[rows.indexOf(row) - 1];
    onPartsChange(parts.map((p) => ({ ...p, questions: p.questions.filter((q) => q.id !== id) })));
    setSelected(selected.filter((x) => x !== id));
    if (neighbour) focusCell({ id: neighbour.q.id, col: active?.col ?? "prompt" });
  }

  function addQuestion(partId: string, q: Question) {
    onPartsChange(parts.map((p) => (p.id === partId ? { ...p, questions: [...p.questions, q] } : p)));
    // The new row opens with its prompt ready to type.
    const cell: Cell = { id: q.id, col: "prompt" };
    setActive(cell);
    setEdit({ ...cell, value: q.prompt });
  }

  function drop(partId: string, index: number) {
    if (dragId) onPartsChange(moveQuestion(parts, dragId, partId, index));
    setDragId(null);
    setOver(null);
  }

  const panelRow = panelId ? rowById.get(panelId) : undefined;
  const firstStop = rows[0]?.q.id;
  const optionsFor = (q: Question, col: Col): [string, string][] =>
    col === "partial"
      ? [["yes", "Yes"], ["no", "No"]]
      : col === "game"
        ? [["standard", gameLabel.standard], ["double", gameLabel.double], ["none", gameLabel.none]]
        : q.type === "true_false"
          ? [["true", "True"], ["false", "False"]]
          : [];

  function renderCell(row: Row, col: Col) {
    const { q, part } = row;
    const cell: Cell = { id: q.id, col };
    const isEditing = editing?.id === q.id && editing.col === col;
    const pool = part.poolSize !== null;
    const editable = cellEditable(q, col, pool);
    const isStop = active ? active.id === q.id && active.col === col : q.id === firstStop && col === "prompt";
    const label = `${colLabel[col]} of question ${row.number}`;

    let content: ReactNode;
    if (isEditing) {
      const value = editing.value;
      if (isSelect(q, col)) {
        content = (
          <select
            autoFocus
            value={value}
            aria-label={label}
            onPointerDown={() => (pointer.current = true)}
            onKeyDown={(e) => {
              pointer.current = false;
              onEditKeyDown(e);
            }}
            onChange={(e) => {
              setEdit({ ...editing, value: e.target.value });
              // Picking with the mouse is the whole edit; the keys wait for Enter.
              if (pointer.current) {
                pointer.current = false;
                queueMicrotask(() => commit("stay"));
              }
            }}
            onBlur={() => commit(null)}
            className={clsx(inputBase, "w-full py-1")}
          >
            {optionsFor(q, col).map(([v, text]) => (
              <option key={v} value={v}>
                {text}
              </option>
            ))}
          </select>
        );
      } else if (col === "prompt") {
        content = (
          <textarea
            autoFocus
            rows={2}
            value={value}
            aria-label={label}
            onFocus={(e) => e.currentTarget.setSelectionRange(value.length, value.length)}
            onChange={(e) => setEdit({ ...editing, value: e.target.value })}
            onKeyDown={onEditKeyDown}
            onBlur={() => commit(null)}
            className={clsx(inputBase, "w-full resize-y py-1")}
          />
        );
      } else {
        content = (
          <input
            autoFocus
            value={value}
            aria-label={label}
            inputMode={col === "points" || (col === "answer" && q.type === "numeric") ? "decimal" : undefined}
            onFocus={(e) => e.currentTarget.setSelectionRange(value.length, value.length)}
            onChange={(e) => setEdit({ ...editing, value: e.target.value })}
            onKeyDown={onEditKeyDown}
            onBlur={() => commit(null)}
            className={clsx(inputBase, "w-full py-1", (col === "points" || (col === "answer" && q.type === "numeric")) && "text-right tabular-nums")}
          />
        );
      }
    } else {
      switch (col) {
        case "prompt": {
          const text = plainText(q.prompt);
          const problem = problems.get(q.id);
          content = (
            <span className="flex items-start gap-1.5">
              <span className={clsx("line-clamp-2 min-w-0 flex-1 break-words", !text && "italic text-muted")} title={text}>
                {text || "Empty"}
              </span>
              {problem && (
                <span title={`Question ${row.number} ${problem}`} className="shrink-0 text-warning">
                  <TriangleAlert className="size-4" aria-hidden />
                  <span className="sr-only">Needs attention: question {row.number} {problem}</span>
                </span>
              )}
            </span>
          );
          break;
        }
        case "answer": {
          const text = answerSummary(q);
          content = (
            <span className={clsx("line-clamp-2 break-words", !editable && "text-muted")} title={editable ? text : `${text}. Press Enter to open the full editor.`}>
              {text || <span className="italic text-muted">Not set</span>}
            </span>
          );
          break;
        }
        case "points":
          content = <span className={clsx("block text-right tabular-nums", pool && "text-muted")} title={pool ? "Set by the part's pool" : undefined}>{q.points}</span>;
          break;
        case "partial":
          content = <span>{q.partialCredit ? "Yes" : "No"}</span>;
          break;
        case "game":
          content = <span>{gameLabel[q.gamePoints]}</span>;
          break;
        case "topic":
          content = <span className="block truncate">{q.topic ?? ""}</span>;
          break;
      }
    }

    return (
      <td
        key={col}
        role="gridcell"
        data-cell={`${q.id}:${col}`}
        tabIndex={isEditing ? undefined : isStop ? 0 : -1}
        aria-label={isEditing ? undefined : `${label}: ${col === "answer" ? answerSummary(q) : cellText(q, col)}`}
        aria-readonly={!editable || undefined}
        onFocus={(e) => {
          if (e.target === e.currentTarget) setActive(cell);
        }}
        onClick={() => {
          // A dropdown opens on the first click; a text cell on the second (the first selects it).
          if (!isEditing && editable && (isSelect(q, col) || (active?.id === q.id && active.col === col))) startEdit(cell);
        }}
        onDoubleClick={() => !isEditing && startEdit(cell)}
        onKeyDown={(e) => !isEditing && onCellKeyDown(e, cell)}
        className={clsx(
          cellBase,
          "scroll-mt-10 scroll-ml-28 focus:outline-2 focus:-outline-offset-2 focus:outline-primary",
          col === "prompt" && "w-96 min-w-72",
          col === "answer" && "w-64 min-w-52",
          col === "points" && "w-24 min-w-24",
          col === "partial" && "w-28 min-w-28",
          col === "game" && "w-36 min-w-36",
          col === "topic" && "w-36 min-w-32",
          !editable && !isEditing && "bg-surface-muted/40",
        )}
      >
        {content}
      </td>
    );
  }

  return (
    <div className="space-y-3" onPaste={onPaste}>
      {selected.length > 0 && (
        <div role="region" aria-label="Selected questions" className="flex flex-wrap items-end gap-x-4 gap-y-2 rounded-xl border border-primary/40 bg-primary-soft p-3 text-sm">
          <p className="font-medium">
            {selected.length} selected
          </p>
          <label className="flex items-center gap-1.5">
            Points
            <input
              value={bulk.points}
              onChange={(e) => setBulk({ ...bulk, points: e.target.value })}
              inputMode="decimal"
              className={clsx(inputBase, "w-20 py-1 text-right tabular-nums")}
            />
            <Button variant="secondary" disabled={!bulk.points.trim()} onClick={() => applyBulk("points", bulk.points)}>
              Set
            </Button>
          </label>
          <label className="flex items-center gap-1.5">
            Game points
            <select value={bulk.game} onChange={(e) => setBulk({ ...bulk, game: e.target.value })} className={clsx(inputBase, "py-1")}>
              <option value="">Choose…</option>
              <option value="standard">{gameLabel.standard}</option>
              <option value="double">{gameLabel.double}</option>
              <option value="none">{gameLabel.none}</option>
            </select>
            <Button variant="secondary" disabled={!bulk.game} onClick={() => applyBulk("game", bulk.game)}>
              Set
            </Button>
          </label>
          <label className="flex items-center gap-1.5">
            Move to part
            <select value={bulk.part} onChange={(e) => setBulk({ ...bulk, part: e.target.value })} className={clsx(inputBase, "max-w-44 py-1")}>
              <option value="">Choose…</option>
              {parts.map((p, i) => (
                <option key={p.id} value={p.id}>
                  {roman(i + 1)}. {partName(p, i)}
                </option>
              ))}
            </select>
            <Button variant="secondary" disabled={!bulk.part} onClick={() => moveSelected(bulk.part)}>
              Move
            </Button>
          </label>
          <Button
            variant="danger"
            onClick={() => {
              const gone = new Set(selected);
              onPartsChange(parts.map((p) => ({ ...p, questions: p.questions.filter((q) => !gone.has(q.id)) })));
              setSelected([]);
            }}
          >
            <Trash2 className="size-4" aria-hidden /> Delete
          </Button>
          <Button variant="ghost" onClick={() => setSelected([])}>
            <X className="size-4" aria-hidden /> Clear selection
          </Button>
        </div>
      )}

      <div ref={gridRef} className="space-y-6">
        {parts.map((part, pi) => {
          const totals = partTotals(part);
          const label = partName(part, pi);
          const ids = part.questions.map((q) => q.id);
          const allSelected = ids.length > 0 && ids.every((id) => selectedSet.has(id));
          return (
            <Fragment key={part.id}>
              {pi > 0 && (
                <div role="separator" aria-label={partHeading(part.title, pi + 1)} className="flex items-center gap-3 text-sm font-semibold text-muted">
                  <hr aria-hidden className="flex-1 border-t-2 border-border" />
                  <span>— {partHeading(part.title, pi + 1)} —</span>
                  <hr aria-hidden className="flex-1 border-t-2 border-border" />
                </div>
              )}
              <section id={`part-${part.id}`} aria-label={`Part ${roman(pi + 1)}: ${label}`} className="scroll-mt-24 space-y-2">
                <div
                  onDragOver={(e) => {
                    if (!dragId) return;
                    e.preventDefault();
                    setOver({ partId: part.id, index: 0 });
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    drop(part.id, 0);
                  }}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1"
                >
                  <Badge tone="primary">Part {roman(pi + 1)}</Badge>
                  <input
                    value={part.title}
                    onChange={(e) => onPartsChange(parts.map((p) => (p.id === part.id ? { ...p, title: e.target.value } : p)))}
                    aria-label={`Title of part ${pi + 1}`}
                    placeholder="Part title"
                    className={clsx(inputBase, "w-64 py-1 font-semibold")}
                  />
                  <span className="text-sm text-muted tabular-nums">
                    {totals.questionCount} {totals.questionCount === 1 ? "question" : "questions"} · {totals.totalPoints} pts
                  </span>
                </div>

                <div className="overflow-x-auto rounded-xl border border-border bg-surface">
                  <table role="grid" aria-label={`Questions in part ${roman(pi + 1)}: ${label}`} className="w-max min-w-full border-separate border-spacing-0 text-left">
                    <thead>
                      <tr>
                        <th scope="col" className={clsx(th, "left-0 z-30 w-10 min-w-10")}>
                          <input
                            type="checkbox"
                            aria-label={`Select all questions in ${label}`}
                            checked={allSelected}
                            disabled={ids.length === 0}
                            onChange={(e) =>
                              setSelected(
                                e.target.checked
                                  ? [...new Set([...selected, ...ids])]
                                  : selected.filter((id) => !ids.includes(id)),
                              )
                            }
                            className="size-4 accent-primary"
                          />
                        </th>
                        <th scope="col" className={clsx(th, "left-10 z-30 w-16 min-w-16")}>#</th>
                        <th scope="col" className={clsx(th, "w-32")}>Type</th>
                        <th scope="col" className={clsx(th, "w-96")}>Prompt</th>
                        <th scope="col" className={clsx(th, "w-64")}>Answer</th>
                        <th scope="col" className={clsx(th, "w-24 text-right")}>Points</th>
                        <th scope="col" className={clsx(th, "w-28")}>Partial credit</th>
                        <th scope="col" className={clsx(th, "w-36")}>Game points</th>
                        <th scope="col" className={clsx(th, "w-36")}>Topic</th>
                        <th scope="col" className={clsx(th, "w-40")}>Row</th>
                      </tr>
                    </thead>
                    <tbody>
                      {part.questions.length === 0 && (
                        <tr
                          onDragOver={(e) => {
                            if (!dragId) return;
                            e.preventDefault();
                            setOver({ partId: part.id, index: 0 });
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            drop(part.id, 0);
                          }}
                        >
                          <td colSpan={10} className="px-3 py-3 text-sm text-muted">
                            <span className="sticky left-3">No questions in this part. Use “Add row” below, or drag a row here.</span>
                          </td>
                        </tr>
                      )}
                      {part.questions.map((q, qi) => {
                        const row = rowById.get(q.id)!;
                        const sel = selectedSet.has(q.id);
                        const marker =
                          dragId && over?.partId === part.id
                            ? over.index === qi
                              ? "before"
                              : over.index === qi + 1 && qi === part.questions.length - 1
                                ? "after"
                                : null
                            : null;
                        const stick = clsx(
                          "sticky z-10 border-b border-r border-border px-2 py-1.5 align-top text-sm",
                          sel ? "bg-primary-soft" : "bg-surface",
                        );
                        return (
                          <tr
                            key={q.id}
                            id={`question-${q.id}`}
                            aria-selected={sel}
                            onDragOver={(e) => {
                              if (!dragId) return;
                              e.preventDefault();
                              const box = e.currentTarget.getBoundingClientRect();
                              setOver({ partId: part.id, index: e.clientY < box.top + box.height / 2 ? qi : qi + 1 });
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              drop(part.id, over?.partId === part.id ? over.index : qi);
                            }}
                            className={clsx(
                              "scroll-mt-24",
                              sel && "bg-primary-soft",
                              dragId === q.id && "opacity-50",
                              marker === "before" && "[&>td]:border-t-4 [&>td]:border-t-primary",
                              marker === "after" && "[&>td]:border-b-4 [&>td]:border-b-primary",
                            )}
                          >
                            <td className={clsx(stick, "left-0 w-10 min-w-10")}>
                              <input
                                type="checkbox"
                                checked={sel}
                                aria-label={`Select question ${row.number}`}
                                onClick={(e) => {
                                  e.preventDefault();
                                  toggleRow(q.id, e.shiftKey);
                                }}
                                onChange={() => {}}
                                className="size-4 accent-primary"
                              />
                            </td>
                            <td className={clsx(stick, "left-10 w-16 min-w-16")}>
                              <span className="flex items-center gap-1">
                                <span
                                  draggable
                                  onDragStart={(e) => {
                                    e.dataTransfer.effectAllowed = "move";
                                    e.dataTransfer.setData("text/plain", q.id);
                                    setDragId(q.id);
                                  }}
                                  onDragEnd={() => {
                                    setDragId(null);
                                    setOver(null);
                                  }}
                                  title="Drag to move the row, also into another part"
                                  className="cursor-grab touch-none text-muted hover:text-foreground active:cursor-grabbing"
                                >
                                  <GripVertical className="size-4" aria-hidden />
                                  <span className="sr-only">Drag to move</span>
                                </span>
                                <span className="font-semibold tabular-nums">{row.number}</span>
                              </span>
                            </td>
                            <td className={cellBase}>
                              <Badge tone="primary">{questionTypeLabel[q.type]}</Badge>
                            </td>
                            {dataCols.map((col) => renderCell(row, col))}
                            <td className={cellBase}>
                              <span className="flex items-center gap-0.5">
                                <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => setPanelId(q.id)} aria-label={`Edit question ${row.number} in full`}>
                                  <Pencil className="size-3.5" aria-hidden /> Edit
                                </Button>
                                <Button variant="ghost" className="px-1.5 py-1" aria-label={`Move question ${row.number} up`} disabled={row.number === 1} onClick={() => onPartsChange(stepQuestion(parts, q.id, -1))}>
                                  <ArrowUp className="size-4" aria-hidden />
                                </Button>
                                <Button variant="ghost" className="px-1.5 py-1" aria-label={`Move question ${row.number} down`} disabled={row.number === rows.length} onClick={() => onPartsChange(stepQuestion(parts, q.id, 1))}>
                                  <ArrowDown className="size-4" aria-hidden />
                                </Button>
                                <Button variant="ghost" className="px-1.5 py-1 text-danger" aria-label={`Delete question ${row.number}`} onClick={() => removeQuestion(q.id)}>
                                  <Trash2 className="size-4" aria-hidden />
                                </Button>
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    {/* Add row sits in the table's last column, under the row actions. */}
                    <tfoot>
                      <tr>
                        <td colSpan={9} className="bg-surface-muted/40" />
                        <td className="bg-surface-muted/40 px-2 py-1.5">
                          <AddQuestionMenu
                            area={area}
                            variant="ghost"
                            className="px-2 py-1 text-sm text-primary"
                            label="Add row"
                            onAdd={(q) => addQuestion(part.id, q)}
                          />
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </section>
            </Fragment>
          );
        })}
      </div>

      <p role={message?.error ? "alert" : "status"} className={clsx("min-h-5 text-sm", message?.error ? "text-danger" : "text-muted")}>
        {message?.text ?? "Click a cell or press Enter to edit it, Esc to cancel. Arrows and Tab move around, Enter commits and moves down. Paste columns from Excel or Sheets."}
      </p>

      <Dialog
        open={panelRow !== undefined}
        onClose={() => setPanelId(null)}
        title={panelRow ? `Edit question ${panelRow.number}` : "Edit question"}
        description={panelRow ? `${questionTypeLabel[panelRow.q.type]} · ${partName(panelRow.part, panelRow.pi)}` : undefined}
        size="xl"
        footer={<Button onClick={() => setPanelId(null)}>Done</Button>}
      >
        {panelRow && (
          <QuestionFields
            question={panelRow.q}
            number={panelRow.number}
            poolLocked={panelRow.part.poolSize !== null}
            onChange={(next) => onPartsChange(replaceQuestion(parts, next))}
          />
        )}
      </Dialog>
    </div>
  );
}
