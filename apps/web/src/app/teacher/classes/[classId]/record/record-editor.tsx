"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { CalendarCheck, Download, Link2, Plus, Printer, Save, Settings2, X } from "lucide-react";
import { Badge, Button, ButtonLink, Card, CardHeader, Field, inputBase, inputClass } from "@/components/ui";
import { absenceLimit, categoryResult, courseResult, passingGrade, termResult, type LinkedScores } from "@/lib/grading";
import type { Class, ClassRecord, GradingTerm, RecordCategory } from "@/lib/types";
import { saveRecord } from "./actions";

type RecordStudent = { id: string; name: string; studentNumber: string; sex: "M" | "F" };
type Linkable = { id: string; title: string; kind: string; maxScore: number };
type Tab = GradingTerm | "course";

const newId = () => crypto.randomUUID().slice(0, 8);
// "Quizzes" → "Quiz", "Major Projects" → "Major Project", for naming new items.
const singular = (name: string) =>
  /zzes$/i.test(name) ? name.slice(0, -3) : /ies$/i.test(name) ? `${name.slice(0, -3)}y` : name.replace(/(?<!s)s$/i, "");
const fmt = (n: number, digits = 2) => (Number.isInteger(n) ? String(n) : n.toFixed(digits));
const termLabel: Record<GradingTerm, string> = { midterm: "Midterm", final: "Final term" };
// The grade sheet asks for F, DR and FA in red ink.
const remarkClass = (r: string) => (r === "P" ? "text-success" : "font-semibold text-danger");

export function RecordEditor({
  cls,
  initial,
  students,
  linked,
  pending,
  linkable,
  attendanceTaken,
  attendance,
}: {
  cls: Class;
  attendanceTaken: boolean;
  attendance: { taken: number; open: number };
  initial: ClassRecord;
  students: RecordStudent[];
  linked: LinkedScores;
  pending: Record<string, string[]>;
  linkable: Linkable[];
}) {
  const [record, setRecord] = useState(initial);
  const [tab, setTab] = useState<Tab>("midterm");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  // Male students first, then female, each alphabetical (as the school's class record asks).
  const groups = useMemo(() => {
    const byName = (a: RecordStudent, b: RecordStudent) => a.name.localeCompare(b.name);
    return [
      { label: "MALE STUDENTS", list: students.filter((s) => s.sex === "M").sort(byName) },
      { label: "FEMALE STUDENTS", list: students.filter((s) => s.sex === "F").sort(byName) },
    ].filter((g) => g.list.length > 0);
  }, [students]);

  const update = (fn: (r: ClassRecord) => ClassRecord) => {
    setRecord((r) => fn(structuredClone(r)));
    setDirty(true);
    setMessage(null);
  };

  async function save() {
    setSaving(true);
    const error = await saveRecord(cls.id, record);
    setSaving(false);
    if (error) setMessage({ tone: "danger", text: error });
    else {
      setDirty(false);
      setMessage({ tone: "success", text: "Saved (demo). Kept until the server restarts; students' Standing uses it." });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border">
        <nav aria-label="Class record" className="-mb-px flex gap-1">
          {(
            [
              ["midterm", "Midterm"],
              ["final", "Final term"],
              ["course", "Course grade"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-current={tab === value ? "page" : undefined}
              onClick={() => setTab(value)}
              className={clsx(
                "border-b-2 px-3 py-2.5 text-sm font-medium",
                tab === value ? "border-primary text-foreground" : "border-transparent text-muted hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="flex flex-wrap items-center gap-2 pb-2">
          {dirty && <span className="text-xs text-warning">Unsaved changes</span>}
          <Button variant="secondary" onClick={() => exportExcel(cls, record, groups, linked)}>
            <Download className="size-4" aria-hidden /> Excel
          </Button>
          <ButtonLink href={`/teacher/classes/${cls.id}/grade-sheet`} variant="secondary">
            <Printer className="size-4" aria-hidden /> Grade sheet
          </ButtonLink>
          <Button onClick={save} disabled={!dirty || saving}>
            <Save className="size-4" aria-hidden /> {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      {tab !== "course" && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface px-4 py-2.5 text-sm">
          <CalendarCheck className="size-4 shrink-0 text-info" aria-hidden />
          <span className="flex-1">
            <span className="font-medium">Attendance</span>{" "}
            <span className="text-muted">
              · {attendance.taken} {attendance.taken === 1 ? "meeting" : "meetings"} taken. No. of Absences and the
              Attendance item come from the roll call (7 lates = 1 absence; excused don&apos;t count). Quiz and exam sessions
              you start for this class are added by themselves and score as students submit (blue).
            </span>
          </span>
          <Link href={`/teacher/classes/${cls.id}/attendance`} className="font-medium text-primary hover:underline">
            {attendance.open > 0 ? "Take attendance" : "View attendance"} →
          </Link>
        </div>
      )}

      {message && (
        <p
          role="status"
          className={clsx(
            "rounded-lg p-3 text-sm",
            message.tone === "success" ? "bg-success-soft text-success" : "bg-danger-soft text-danger",
          )}
        >
          {message.text}
        </p>
      )}

      {tab === "course" ? (
        <CourseTab record={record} groups={groups} linked={linked} update={update} />
      ) : (
        <TermTab
          key={tab}
          term={tab}
          attendanceTaken={attendanceTaken}
          classId={cls.id}
          record={record}
          groups={groups}
          linked={linked}
          pending={pending}
          linkable={linkable}
          update={update}
        />
      )}
    </div>
  );
}

type Groups = { label: string; list: RecordStudent[] }[];
type Update = (fn: (r: ClassRecord) => ClassRecord) => void;

// Spreadsheet look, like the school's Excel class record.
const grid = "border-slate-300 dark:border-slate-700";
const thick = "border-r-2 border-r-slate-500 dark:border-r-slate-400";
// Each cell gets exactly one background and one alignment, so classes never fight.
const headCell = `border ${grid} bg-slate-200 px-1 text-center font-bold text-slate-900 dark:bg-slate-800 dark:text-slate-100`;
const maxBase = `border ${grid} px-1 text-center font-bold tabular-nums`;
const maxRow = `${maxBase} bg-sky-100 text-slate-900 dark:bg-sky-950 dark:text-sky-100`;
const yellow = `${maxBase} bg-amber-300 text-slate-900 dark:bg-amber-400 dark:text-slate-950`;
const rowBlue = "bg-sky-200/70 dark:bg-sky-900/50";
const scoreCell = `border ${grid} ${rowBlue}`;
const nameCell = `border ${grid} px-1.5 text-left bg-sky-200 dark:bg-sky-900`;
const calcCell = `border ${grid} px-1.5 text-right tabular-nums`;
const cellInput =
  "w-full min-w-0 bg-transparent px-1 py-1 text-center tabular-nums outline-none focus:bg-white focus:ring-2 focus:ring-primary focus:ring-inset dark:focus:bg-slate-900";

// Enter / ↓ moves to the same column in the next student's row, ↑ to the previous one, like a spreadsheet.
function moveFocus(e: React.KeyboardEvent<HTMLInputElement>) {
  const step = e.key === "Enter" || e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
  if (!step) return;
  e.preventDefault();
  const { col, row } = e.currentTarget.dataset;
  const next = document.querySelector<HTMLInputElement>(`input[data-col="${col}"][data-row="${Number(row) + step}"]`);
  next?.focus();
  next?.select();
}

// The spare column at the end of a category: type the highest possible score to add an item there.
function NewItemCell({ onAdd, label }: { onAdd: (max: number) => void; label: string }) {
  const [value, setValue] = useState("");
  const commit = () => {
    const n = Number(value);
    if (value.trim() && n > 0) onAdd(n);
    setValue("");
  };
  return (
    <input
      type="number"
      min={1}
      value={value}
      placeholder="+"
      title={`Type the highest possible score to add ${label}`}
      aria-label={`Add ${label}: highest possible score`}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && commit()}
      className={`${cellInput} placeholder:text-slate-400`}
    />
  );
}

function TermTab({
  term,
  attendanceTaken,
  classId,
  record,
  groups,
  linked,
  pending,
  linkable,
  update,
}: {
  term: GradingTerm;
  attendanceTaken: boolean;
  classId: string;
  record: ClassRecord;
  groups: Groups;
  linked: LinkedScores;
  pending: Record<string, string[]>;
  linkable: Linkable[];
  update: Update;
}) {
  const cats = record.terms[term];
  const adwCats = cats.filter((c) => !c.isExam);
  const examCats = cats.filter((c) => c.isExam);
  const adwWeight = adwCats.reduce((n, c) => n + c.weight, 0);
  const total = cats.reduce((n, c) => n + c.weight, 0);
  const examWeight = total - adwWeight;
  // Each category: its items, a spare column, the raw total and the weighted score.
  const span = (c: RecordCategory) => c.items.length + 3;

  const editCat = (catId: string, fn: (c: RecordCategory) => void) =>
    update((r) => {
      const c = r.terms[term].find((x) => x.id === catId);
      if (c) fn(c);
      return r;
    });
  const setScore = (itemId: string, studentId: string, value: string) =>
    update((r) => {
      const n = value.trim() === "" ? null : Math.max(0, Number(value));
      r.scores[itemId] = { ...r.scores[itemId], [studentId]: n === null || Number.isNaN(n) ? null : n };
      return r;
    });
  const setAbsences = (studentId: string, value: string) =>
    update((r) => {
      r.absences[term][studentId] = Math.max(0, Math.floor(Number(value) || 0));
      return r;
    });
  const addItem = (c: RecordCategory, max: number) =>
    editCat(c.id, (x) =>
      x.items.push({
        id: `${c.id}-${newId()}`,
        title: c.isExam ? (x.items.length ? `${c.name} part ${x.items.length + 1}` : c.name) : `${singular(c.name)} ${x.items.length + 1}`,
        maxScore: max,
        sessionId: null,
      }),
    );

  // The header cells for one category, row by row.
  const catHeaders = (c: RecordCategory) => ({
    title: (
      <th key={c.id} colSpan={span(c)} className={clsx(headCell, thick, "py-1.5 text-sm uppercase")}>
        {c.name}
      </th>
    ),
    labels: (
      <Fragment key={c.id}>
        {c.items.map((item) => (
          <th key={item.id} className={clsx(headCell, "w-14 font-normal")}>
            <input
              value={item.title}
              onChange={(e) => editCat(c.id, (x) => (x.items.find((i) => i.id === item.id)!.title = e.target.value))}
              title={item.title}
              aria-label="Item title or date"
              className="w-14 truncate bg-transparent text-center text-[10px] outline-none focus:bg-white dark:focus:bg-slate-900"
            />
          </th>
        ))}
        <th className={clsx(headCell, "w-10")} />
        <th className={headCell} />
        <th className={clsx(headCell, thick)} />
      </Fragment>
    ),
    max: (
      <Fragment key={c.id}>
        {c.items.map((item) => (
          <th key={item.id} className={clsx(maxRow, "p-0")}>
            {item.sessionId || item.source === "attendance" ? (
              <span className="block px-1 py-1 text-info" title={item.source === "attendance" ? "Meetings held" : "From a quiz session"}>
                {item.maxScore}
              </span>
            ) : (
              <input
                type="number"
                min={0}
                value={item.maxScore}
                onChange={(e) =>
                  editCat(c.id, (x) => (x.items.find((i) => i.id === item.id)!.maxScore = Math.max(0, Number(e.target.value) || 0)))
                }
                aria-label={`${item.title} highest possible score`}
                className={cellInput}
              />
            )}
          </th>
        ))}
        <th className={clsx(maxRow, "p-0 font-normal")}>
          <NewItemCell label={c.isExam ? "an exam part" : `a ${singular(c.name).toLowerCase()}`} onAdd={(max) => addItem(c, max)} />
        </th>
        <th className={maxRow} title="Highest possible total">
          {c.items.reduce((n, i) => n + i.maxScore, 0)}
        </th>
        <th className={clsx(yellow, thick, "p-0")} title="Weight (%)">
          <input
            type="number"
            min={0}
            max={100}
            value={c.weight}
            onChange={(e) => editCat(c.id, (x) => (x.weight = Math.max(0, Number(e.target.value) || 0)))}
            aria-label={`${c.name} weight in percent`}
            className={clsx(cellInput, "w-12 font-bold")}
          />
        </th>
      </Fragment>
    ),
  });
  const adwHead = adwCats.map(catHeaders);
  const examHead = examCats.map(catHeaders);

  // Column indexes for keyboard moves: absences is column 0, then each typed-in item.
  const typedItems = [...adwCats, ...examCats].flatMap((c) => c.items.filter((i) => !i.sessionId).map((i) => i.id));
  const colOf = (itemId: string) => typedItems.indexOf(itemId) + 1;
  let rowNo = 0;

  const studentCells = (c: RecordCategory, s: RecordStudent, row: number) => {
    const r = categoryResult(record, linked, c, s.id);
    return (
      <Fragment key={c.id}>
        {c.items.map((item) =>
          item.sessionId || item.source === "attendance" ? (
            <td
              key={item.id}
              className={clsx(scoreCell, "px-1 text-center text-info tabular-nums")}
              title={item.source === "attendance" ? "From attendance" : "From a quiz session"}
            >
              {pending[item.id]?.includes(s.id) ? (
                <span className="text-muted" title="An essay is still being graded">…</span>
              ) : (
                (linked[item.id]?.[s.id] ?? "")
              )}
            </td>
          ) : (
            <td key={item.id} className={clsx(scoreCell, "p-0")}>
              <input
                type="number"
                min={0}
                max={item.maxScore}
                value={record.scores[item.id]?.[s.id] ?? ""}
                onChange={(e) => setScore(item.id, s.id, e.target.value)}
                onKeyDown={moveFocus}
                data-row={row}
                data-col={colOf(item.id)}
                aria-label={`${s.name}, ${c.name}, ${item.title}`}
                className={clsx(cellInput, (record.scores[item.id]?.[s.id] ?? 0) > item.maxScore && "text-danger")}
              />
            </td>
          ),
        )}
        <td className={scoreCell} />
        <td className={clsx(calcCell, rowBlue)}>{fmt(r.raw)}</td>
        <td className={clsx(calcCell, thick, rowBlue)}>{fmt(r.weighted)}</td>
      </Fragment>
    );
  };

  return (
    <div className="space-y-4">
      <Setup term={term} cats={cats} linkable={linkable} update={update} adwWeight={adwWeight} total={total} />

      {total !== 100 && (
        <p className="rounded-lg bg-warning-soft p-3 text-sm text-warning">
          Weights add up to {total}%. They should total 100% (ADW 60% + major exam 40% in most Learning Plans).
        </p>
      )}

      <div className="max-h-[75vh] overflow-auto rounded-lg border border-slate-400 shadow-sm dark:border-slate-600">
        <table className="w-max border-separate border-spacing-0 text-xs text-slate-900 dark:text-slate-100">
          <thead className="sticky top-0 z-20">
            <tr>
              <th rowSpan={2} className={clsx(headCell, "sticky left-0 z-30 w-9 py-2")}>
                No.
              </th>
              <th rowSpan={2} className={clsx(headCell, thick, "sticky left-9 z-30 min-w-56 text-sm")}>
                Name
              </th>
              <th rowSpan={2} className={clsx(headCell, thick, "w-16 text-[10px] leading-tight")}>
                No. of Absences
              </th>
              {adwHead.map((h) => h.title)}
              <th className={clsx(headCell, thick, "text-[10px]")}>TOTAL</th>
              {examHead.map((h) => h.title)}
              <th className={clsx(headCell, "w-14")} />
              <th className={clsx(headCell, "w-14")} />
            </tr>
            <tr>
              {adwHead.map((h) => h.labels)}
              <th className={clsx(headCell, thick, "text-sm underline")}>ADW</th>
              {examHead.map((h) => h.labels)}
              <th className={clsx(headCell, "text-sm")} title="Raw score: ADW + exam">
                RS
              </th>
              <th className={clsx(headCell, "text-sm")} title={term === "midterm" ? "Midterm grade" : "Final term grade"}>
                {term === "midterm" ? "MG" : "FG"}
              </th>
            </tr>
            <tr>
              <th className={clsx(maxRow, "sticky left-0 z-30")} />
              <th className={clsx(maxBase, thick, "sticky left-9 z-30 bg-sky-100 text-left! text-[11px] font-semibold dark:bg-sky-950")}>
                Highest possible score →
              </th>
              <th className={clsx(maxRow, thick)} />
              {adwHead.map((h) => h.max)}
              <th className={clsx(yellow, thick)} title="ADW total weight">
                {adwWeight}
              </th>
              {examHead.map((h) => h.max)}
              <th className={maxRow}>{total}</th>
              <th className={maxRow}>1.00</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <Fragment key={g.label}>
                <tr>
                  <td className={clsx(maxRow, "sticky left-0")} />
                  <td className={clsx(maxBase, thick, "sticky left-9 bg-sky-100 px-1.5 text-left! text-sm dark:bg-sky-950")}>
                    {g.label}
                  </td>
                  <td colSpan={999} className={clsx(maxRow)} />
                </tr>
                {g.list.map((s) => {
                  const row = rowNo++;
                  const result = termResult(record, linked, term, s.id);
                  const dropped = record.dropped.includes(s.id);
                  return (
                    <tr key={s.id} className={clsx(dropped && "opacity-50")}>
                      <td className={clsx(calcCell, "sticky left-0 z-10 bg-sky-200 dark:bg-sky-900")}>{row + 1}</td>
                      <td className={clsx(nameCell, thick, "sticky left-9 z-10 whitespace-nowrap")}>
                        {s.name}
                        {dropped && <span className="ml-1 font-semibold text-danger">DR</span>}
                      </td>
                      <td className={clsx(scoreCell, thick, "p-0")}>
                        {attendanceTaken ? (
                          <span className="block px-1 py-1 text-center text-info tabular-nums" title="From attendance">
                            {record.absences[term][s.id] ?? 0}
                          </span>
                        ) : (
                        <input
                          type="number"
                          min={0}
                          value={record.absences[term][s.id] ?? 0}
                          onChange={(e) => setAbsences(s.id, e.target.value)}
                          onKeyDown={moveFocus}
                          data-row={row}
                          data-col={0}
                          aria-label={`${s.name} absences`}
                          className={cellInput}
                        />
                        )}
                      </td>
                      {adwCats.map((c) => studentCells(c, s, row))}
                      <td className={clsx(calcCell, thick, rowBlue, "font-semibold")}>{fmt(result.adw)}</td>
                      {examCats.map((c) => studentCells(c, s, row))}
                      <td className={clsx(calcCell, rowBlue, "font-bold")}>{fmt(result.rawScore)}</td>
                      <td
                        className={clsx(
                          calcCell,
                          "text-sm font-semibold",
                          // Failing grades in red on pink, as in the Excel class record.
                          result.grade > passingGrade
                            ? "bg-rose-200 text-rose-600 dark:bg-rose-950 dark:text-rose-300"
                            : rowBlue,
                        )}
                      >
                        {result.grade.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">
        Type highest possible scores in the top row and weights in the yellow cells; type in the last column of a
        category (+) to add an item. Enter or ↓ moves to the next student. Blue numbers come from quiz sessions; “…” means an essay is still being graded. Empty scores count as 0, as in the Excel class record. Exam
        weight: {examWeight}%.{" "}
        {attendanceTaken ? (
          <>
            No. of Absences comes from <Link href={`/teacher/classes/${classId}/attendance`} className="underline">attendance</Link>{" "}
            (7 lates = 1 absence). An item set to “From attendance” scores meetings held minus absences.
          </>
        ) : (
          "Type absences in, or take attendance in Examinus to fill them in."
        )}
      </p>
    </div>
  );
}

// Categories, weights and items for one term (the yellow cells in the Excel class record).
function Setup({
  term,
  cats,
  linkable,
  update,
  adwWeight,
  total,
}: {
  term: GradingTerm;
  cats: RecordCategory[];
  linkable: Linkable[];
  update: Update;
  adwWeight: number;
  total: number;
}) {
  const edit = (catId: string, fn: (c: RecordCategory) => void) =>
    update((r) => {
      const c = r.terms[term].find((x) => x.id === catId);
      if (c) fn(c);
      return r;
    });

  return (
    <Card>
      <details>
        <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-5 py-3.5">
          <Settings2 className="size-4 text-muted" aria-hidden />
          <span className="flex-1 font-medium">
            {termLabel[term]} setup <span className="font-normal text-muted">· categories, weights and items</span>
          </span>
          <Badge tone={adwWeight === 60 ? "success" : "warning"}>ADW {adwWeight}%</Badge>
          <Badge tone={total === 100 ? "success" : "danger"}>Total {total}%</Badge>
        </summary>
        <div className="space-y-3 border-t border-border p-5">
          <p className="text-sm text-muted">
            Rename categories, link items to quiz sessions, or remove them. Max scores and weights can also
            be typed straight into the class record below.
          </p>
          {cats.map((c) => (
            <div key={c.id} className="rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={c.name}
                  onChange={(e) => edit(c.id, (x) => (x.name = e.target.value))}
                  aria-label="Category name"
                  className={`${inputBase} min-w-40 flex-1 py-1.5 font-medium`}
                />
                <label className="flex items-center gap-1 text-sm">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={c.weight}
                    onChange={(e) => edit(c.id, (x) => (x.weight = Math.max(0, Number(e.target.value) || 0)))}
                    aria-label={`${c.name} weight`}
                    className={`${inputBase} w-20 py-1.5 text-right`}
                  />
                  %
                </label>
                {c.isExam ? <Badge tone="primary">Major exam</Badge> : <Badge>ADW</Badge>}
                {!c.isExam && (
                  <Button
                    variant="ghost"
                    className="px-2"
                    aria-label={`Remove ${c.name}`}
                    onClick={() =>
                      update((r) => {
                        r.terms[term] = r.terms[term].filter((x) => x.id !== c.id);
                        return r;
                      })
                    }
                  >
                    <X className="size-4" />
                  </Button>
                )}
              </div>
              <ul className="mt-2 space-y-1.5">
                {c.items.map((item) => (
                  <li key={item.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <input
                      value={item.title}
                      onChange={(e) => edit(c.id, (x) => (x.items.find((i) => i.id === item.id)!.title = e.target.value))}
                      placeholder="Title, e.g. Quiz 1"
                      aria-label="Item title"
                      className={`${inputBase} min-w-40 flex-1 py-1`}
                    />
                    <label className="flex items-center gap-1 text-muted">
                      out of
                      <input
                        type="number"
                        min={0}
                        value={item.maxScore}
                        disabled={!!item.sessionId || item.source === "attendance"}
                        onChange={(e) =>
                          edit(c.id, (x) => (x.items.find((i) => i.id === item.id)!.maxScore = Math.max(0, Number(e.target.value) || 0)))
                        }
                        aria-label="Maximum score"
                        className={`${inputBase} w-20 py-1 text-right`}
                      />
                    </label>
                    <select
                      value={item.source === "attendance" ? "attendance" : (item.sessionId ?? "")}
                      onChange={(e) => {
                        const a = linkable.find((x) => x.id === e.target.value);
                        update((r) => {
                          if (item.sessionId && item.sessionId !== a?.id)
                            r.unlinked = [...new Set([...(r.unlinked ?? []), item.sessionId])];
                          if (a) r.unlinked = (r.unlinked ?? []).filter((id) => id !== a.id);
                          return r;
                        });
                        edit(c.id, (x) => {
                          const target = x.items.find((i) => i.id === item.id)!;
                          target.sessionId = a?.id ?? null;
                          if (e.target.value === "attendance") {
                            target.source = "attendance";
                            if (!target.title) target.title = "Attendance";
                          } else delete target.source;
                          if (a) {
                            target.maxScore = a.maxScore;
                            if (!target.title) target.title = a.title;
                          }
                        });
                      }}
                      aria-label="Scores from"
                      className={`${inputBase} max-w-56 py-1`}
                    >
                      <option value="">Typed in</option>
                      <option value="attendance">From attendance</option>
                      {linkable.map((a) => (
                        <option key={a.id} value={a.id}>
                          From quiz session: {a.title}
                        </option>
                      ))}
                    </select>
                    {item.sessionId && <Link2 className="size-4 text-info" aria-label="Linked to a quiz session" />}
                    <Button
                      variant="ghost"
                      className="px-2"
                      aria-label={`Remove ${item.title || "item"}`}
                      onClick={() =>
                        update((r) => {
                          const cat = r.terms[term].find((x) => x.id === c.id);
                          if (cat) cat.items = cat.items.filter((i) => i.id !== item.id);
                          // Taken out on purpose: don't add this quiz session back automatically.
                          if (item.sessionId) r.unlinked = [...new Set([...(r.unlinked ?? []), item.sessionId])];
                          return r;
                        })
                      }
                    >
                      <X className="size-4" />
                    </Button>
                  </li>
                ))}
              </ul>
              <Button
                variant="ghost"
                className="mt-1 px-2 py-1 text-xs text-primary"
                onClick={() =>
                  edit(c.id, (x) =>
                    x.items.push({
                      id: `${c.id}-${newId()}`,
                      title: c.isExam ? c.name : `${singular(c.name)} ${x.items.length + 1}`,
                      maxScore: c.isExam ? 100 : 10,
                      sessionId: null,
                    }),
                  )
                }
              >
                <Plus className="size-3.5" aria-hidden /> Add {c.isExam ? "exam part" : "item"}
              </Button>
            </div>
          ))}
          {!cats.some((c) => c.items.some((i) => i.source === "attendance")) && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg bg-info-soft p-3 text-sm text-info">
              <CalendarCheck className="size-4 shrink-0" aria-hidden />
              <span className="flex-1">No item uses attendance yet. Add one to score attendance from the roll call.</span>
              <Button
                variant="secondary"
                className="px-2.5 py-1 text-xs"
                onClick={() =>
                  update((r) => {
                    const cats = r.terms[term];
                    // Into the attendance category if there is one, else a new one.
                    let cat = cats.find((c) => !c.isExam && /attend/i.test(c.name));
                    if (!cat) {
                      cat = { id: `${term[0]}-${newId()}`, name: "Attendance / Participation", weight: 0, isExam: false, items: [] };
                      cats.splice(cats.filter((c) => !c.isExam).length, 0, cat);
                    }
                    cat.items.unshift({ id: `${cat.id}-${newId()}`, title: "Attendance", maxScore: 0, sessionId: null, source: "attendance" });
                    return r;
                  })
                }
              >
                <Plus className="size-3.5" aria-hidden /> Add attendance
              </Button>
            </div>
          )}
          <Button
            variant="secondary"
            onClick={() =>
              update((r) => {
                const exams = r.terms[term].filter((c) => c.isExam);
                r.terms[term] = [
                  ...r.terms[term].filter((c) => !c.isExam),
                  { id: `${term[0]}-${newId()}`, name: "New category", weight: 0, isExam: false, items: [] },
                  ...exams,
                ];
                return r;
              })
            }
          >
            <Plus className="size-4" aria-hidden /> Add ADW category
          </Button>
        </div>
      </details>
    </Card>
  );
}

function CourseTab({
  record,
  groups,
  linked,
  update,
}: {
  record: ClassRecord;
  groups: Groups;
  linked: LinkedScores;
  update: Update;
}) {
  const sign = (key: keyof ClassRecord["signatories"], value: string) =>
    update((r) => {
      r.signatories[key] = value;
      return r;
    });
  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] text-sm">
            <thead>
              <tr className="text-xs text-muted">
                <th rowSpan={2} className="border-b border-border px-3 py-2 text-left">Name</th>
                <th colSpan={4} className="border-b border-l border-border px-2 py-1.5">Midterm</th>
                <th colSpan={4} className="border-b border-l border-border px-2 py-1.5">Final term</th>
                <th colSpan={3} className="border-b border-l border-border px-2 py-1.5">Course</th>
                <th rowSpan={2} className="border-b border-l border-border px-2">Dropped</th>
              </tr>
              <tr className="text-xs text-muted">
                {["A", "RS", "Grade", "R", "A", "RS", "Grade", "R"].map((h, i) => (
                  <th key={i} className={clsx("border-b border-border px-2 py-1 font-medium", i % 4 === 0 && "border-l")}>
                    {h}
                  </th>
                ))}
                <th className="border-b border-l border-border px-2 py-1 font-medium">RS</th>
                <th className="border-b border-border px-2 py-1 font-medium">Grade</th>
                <th className="border-b border-border px-2 py-1 font-medium">R</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <Fragment key={g.label}>
                  <tr>
                    <td colSpan={13} className="bg-surface-muted px-3 py-1 text-[11px] font-semibold tracking-wide text-muted">
                      {g.label}
                    </td>
                  </tr>
                  {g.list.map((s) => {
                    const c = courseResult(record, linked, s.id);
                    const dropped = record.dropped.includes(s.id);
                    return (
                      <tr key={s.id} className="border-b border-border">
                        <td className="px-3 py-1.5 font-medium whitespace-nowrap">{s.name}</td>
                        {([c.midterm, c.final] as const).map((t, i) => (
                          <Fragment key={i}>
                            <td className="border-l border-border px-2 text-center tabular-nums">{t.absences}</td>
                            <td className="px-2 text-right tabular-nums">{fmt(t.rawScore)}</td>
                            <td className={clsx("px-2 text-right font-medium tabular-nums", t.grade > passingGrade && "text-danger")}>
                              {t.grade.toFixed(2)}
                            </td>
                            <td className={clsx("px-2 text-center", remarkClass(t.remark))}>{t.remark}</td>
                          </Fragment>
                        ))}
                        <td className="border-l border-border px-2 text-right tabular-nums">{fmt(c.rawScore)}</td>
                        <td className={clsx("px-2 text-right font-semibold tabular-nums", c.grade > passingGrade && "text-danger")}>
                          {c.grade.toFixed(2)}
                        </td>
                        <td className={clsx("px-2 text-center", remarkClass(c.remark))}>{c.remark}</td>
                        <td className="border-l border-border px-2 text-center">
                          <input
                            type="checkbox"
                            checked={dropped}
                            onChange={(e) =>
                              update((r) => {
                                r.dropped = e.target.checked ? [...r.dropped, s.id] : r.dropped.filter((x) => x !== s.id);
                                return r;
                              })
                            }
                            aria-label={`${s.name} dropped`}
                            className="size-4 accent-primary"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="text-xs text-muted">
        Course RS is the average of the midterm and final raw scores; grades use the transmutation table (3.00 passes).
        P passed, F failed, FA failed due to absences (more than {absenceLimit} in total), DR dropped.
      </p>

      <Card>
        <CardHeader title="Grade sheet signatories" description="Printed at the bottom of the collegiate grade sheet." />
        <div className="grid gap-4 p-5 sm:grid-cols-3">
          <Field label="Checked by (Dean / Program Head)">
            <input value={record.signatories.dean} onChange={(e) => sign("dean", e.target.value)} className={inputClass} />
          </Field>
          <Field label="Noted by (VPAA)">
            <input value={record.signatories.vpaa} onChange={(e) => sign("vpaa", e.target.value)} className={inputClass} />
          </Field>
          <Field label="Received by (Registrar)">
            <input
              value={record.signatories.registrar}
              onChange={(e) => sign("registrar", e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>
      </Card>
    </div>
  );
}

// The class record as an .xlsx: one sheet per term (scores and computed columns) and one for the grade sheet.
async function exportExcel(cls: Class, record: ClassRecord, groups: Groups, linked: LinkedScores) {
  const { default: writeExcelFile } = await import("write-excel-file/browser");
  const bold = (value: string | number) => ({ value, fontWeight: "bold" as const });
  const score = (itemId: string, sid: string) => linked[itemId]?.[sid] ?? record.scores[itemId]?.[sid] ?? null;
  const title = [bold(`${cls.courseCode} · ${cls.title}`), null, null, `${cls.section} · ${cls.term}`];

  const termSheet = (term: GradingTerm) => {
    const cats = [...record.terms[term].filter((c) => !c.isExam), ...record.terms[term].filter((c) => c.isExam)];
    const head1 = ["No.", "Name", "Abs", ...cats.flatMap((c) => [bold(`${c.name} (${c.weight}%)`), ...c.items.map(() => null)]), "ADW", "RS", "Grade"].map(
      (v) => (typeof v === "string" ? bold(v) : v),
    );
    const head2 = [null, null, null, ...cats.flatMap((c) => [...c.items.map((i) => `${i.title} /${i.maxScore}`), "%"]), null, null, null];
    const rows = groups.flatMap((g) => [
      [bold(g.label)],
      ...g.list.map((s, n) => {
        const r = termResult(record, linked, term, s.id);
        return [
          n + 1,
          s.name,
          record.absences[term][s.id] ?? 0,
          ...cats.flatMap((c) => [...c.items.map((i) => score(i.id, s.id)), Number(categoryResult(record, linked, c, s.id).weighted.toFixed(2))]),
          r.adw,
          r.rawScore,
          r.grade,
        ];
      }),
    ]);
    return { sheet: termLabel[term], data: [title, [], head1, head2, ...rows], columns: [{ width: 5 }, { width: 30 }], stickyRowsCount: 4 };
  };

  const sheetRows = groups.flatMap((g) => [
    [bold(g.label)],
    ...g.list.map((s, n) => {
      const c = courseResult(record, linked, s.id);
      return [n + 1, s.name, c.midterm.absences, c.midterm.grade, c.midterm.remark, c.final.absences, c.final.grade, c.final.remark, c.grade, c.remark];
    }),
  ]);
  await writeExcelFile([
    termSheet("midterm"),
    termSheet("final"),
    {
      sheet: "Grade Sheet",
      data: [
        title,
        [],
        ["No.", "Name", "Midterm A", "Midterm Grade", "R", "Final A", "Final Grade", "R", "Course Grade", "Remarks"].map(bold),
        ...sheetRows,
      ],
      columns: [{ width: 5 }, { width: 30 }],
      stickyRowsCount: 3,
    },
  ]).toFile(`class-record-${cls.courseCode}-${cls.section}.xlsx`.replace(/\s+/g, "-"));
}
