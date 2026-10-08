// Anti-cheating that needs no browser or database: the settings each mode starts with, the per-student report
// (counts, minutes, longest gap, timeline) and the checks made after a session ends (matching wrong answers,
// similar essays and code, timing clusters, shared devices) that add up to one low/medium/high level per
// attempt. Nothing here changes a score; it only tells the teacher where to look.
import type { Question } from "./question.ts";
import type { AttemptDetail } from "./quiz-rpc.ts";
import type { AnswerValue, IntegrityEvent, IntegrityEventType, IntegritySettings, SessionMode } from "./quiz.ts";
import { similarPairs, similarTexts, sourceKind } from "./similarity.ts";

// What a student sees when their attempt is open in another browser. The web app tells it apart from other
// conflicts by this text.
export const otherDeviceMessage = "This attempt is open in another browser or device. Go back to the one you started on.";

// --- Settings ---

const noBlocks = {
  blockRightClick: false,
  blockCopy: false,
  blockPaste: false,
  blockPrint: false,
  clearClipboardOnStart: false,
  allowPasteInCode: false,
} as const;

// What a new session starts with for each mode. Exams turn everything on, quizzes and games turn the
// blocking off, mastery only stops copying.
export function defaultIntegrity(mode: SessionMode): IntegritySettings {
  const base = { requireFullscreen: true, trackFocus: true, blockSecondScreen: false, watermark: false, autoSubmitAfter: null };
  switch (mode) {
    case "exam":
      return {
        ...base,
        blockSecondScreen: true,
        autoSubmitAfter: 3,
        watermark: true,
        blockRightClick: true,
        blockCopy: true,
        blockPaste: true,
        blockPrint: true,
        clearClipboardOnStart: true,
        allowPasteInCode: false,
      };
    case "mastery":
      return { ...base, ...noBlocks, blockCopy: true };
    case "game":
      return { ...base, requireFullscreen: false, trackFocus: false, ...noBlocks };
    case "quiz":
      return { ...base, ...noBlocks };
  }
}

// The settings that are on, as short sentences for a summary or the students' instructions.
export function integrityRules(rules: IntegritySettings, kind: string): string[] {
  const rows: [boolean, string][] = [
    [rules.requireFullscreen, "It opens in full screen. Stay in full screen until you submit."],
    [
      rules.trackFocus,
      "Switching tabs or apps (including Alt+Tab), leaving full screen, losing your connection and moving the mouse off the exam are recorded and reported to your teacher.",
    ],
    [rules.blockSecondScreen, "Use one screen only. A second monitor must be disconnected."],
    [rules.blockCopy, "Copying and cutting are turned off, and the question text can't be selected."],
    [
      rules.blockPaste,
      rules.allowPasteInCode
        ? "Pasting and dragging text in are turned off, except in the code editor (every paste there is recorded)."
        : "Pasting and dragging text in are turned off.",
    ],
    [rules.blockRightClick, "Right-click and long-press menus are turned off."],
    [rules.blockPrint, "Printing and saving the page are turned off."],
    [rules.clearClipboardOnStart, "Your clipboard is cleared when you start."],
    [rules.watermark, "Your name is shown faintly across the screen."],
    [
      rules.autoSubmitAfter !== null,
      `You can leave (switch away or exit full screen) and come back ${rules.autoSubmitAfter} ${rules.autoSubmitAfter === 1 ? "time" : "times"}. Leaving once more submits your ${kind} automatically.`,
    ],
  ];
  return rows.filter(([on]) => on).map(([, text]) => text);
}

// --- The report ---

// Leaving the page or switching apps (time away), against leaving full screen (time out of full screen).
export const awayTypes: readonly IntegrityEventType[] = ["left_page", "switched_app", "alt_tab"];
const fullscreenTypes: readonly IntegrityEventType[] = ["exit_fullscreen"];

export type TypeSummary = { type: IntegrityEventType; count: number; totalMs: number; times: string[] };

export type IntegrityReport = {
  // One row per event type seen, most frequent first.
  byType: TypeSummary[];
  // Time on other tabs or apps, out of full screen, and without a connection (ms).
  awayMs: number;
  fullscreenMs: number;
  disconnectedMs: number;
  // The longest single gap of any kind (ms).
  longestGapMs: number;
  // Every event in time order.
  timeline: IntegrityEvent[];
};

export function integrityReport(events: readonly IntegrityEvent[]): IntegrityReport {
  const timeline = [...events].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const byType = new Map<IntegrityEventType, TypeSummary>();
  let awayMs = 0;
  let fullscreenMs = 0;
  let disconnectedMs = 0;
  let longestGapMs = 0;
  for (const e of timeline) {
    const row = byType.get(e.type) ?? { type: e.type, count: 0, totalMs: 0, times: [] };
    const ms = e.durationMs ?? 0;
    row.count++;
    row.totalMs += ms;
    row.times.push(e.at);
    byType.set(e.type, row);
    if (awayTypes.includes(e.type)) awayMs += ms;
    else if (fullscreenTypes.includes(e.type)) fullscreenMs += ms;
    else if (e.type === "disconnected") disconnectedMs += ms;
    if (ms > longestGapMs) longestGapMs = ms;
  }
  return {
    byType: [...byType.values()].sort((a, b) => b.count - a.count || a.type.localeCompare(b.type)),
    awayMs,
    fullscreenMs,
    disconnectedMs,
    longestGapMs,
    timeline,
  };
}

// --- After the session ---

export type IntegrityLevel = "low" | "medium" | "high";

export type Signal = { key: string; label: string; points: number };

// Something two students have in common that points at copying or helping each other.
export type PairKind = "wrong_answers" | "essay_text" | "code" | "timing" | "device" | "network";

export type PairFinding = {
  kind: PairKind;
  // Attempt ids.
  a: string;
  b: string;
  // 0 to 1.
  strength: number;
  detail: string;
  questionIds: string[];
};

export type AttemptIntegrity = {
  attemptId: string;
  report: IntegrityReport;
  score: number;
  level: IntegrityLevel;
  // What adds to the level, biggest first.
  signals: Signal[];
};

export type SessionIntegrity = {
  attempts: Record<string, AttemptIntegrity>;
  pairs: PairFinding[];
};

export const levelOf = (score: number): IntegrityLevel => (score >= 8 ? "high" : score >= 3 ? "medium" : "low");

// An answer given a few seconds after the question appeared is not an answer someone worked out.
export const tooFastMs = 2000;
// Far under the class: below this share of the class's median time, when the class took at least 8 s.
const fastShareOfMedian = 0.25;
const medianFloorMs = 8000;

const isWord = (v: AnswerValue): v is string | string[] => v !== null && typeof v !== "boolean";

// A comparable form of an answer: trimmed and lower-cased text, per item.
function answerKey(v: AnswerValue): string | null {
  if (!isWord(v)) return v === null ? null : String(v);
  const parts = (Array.isArray(v) ? v : [v]).map((x) => x.trim().toLowerCase());
  return parts.every((x) => x === "") ? null : JSON.stringify(parts);
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? (s[mid] ?? 0) : ((s[mid - 1] ?? 0) + (s[mid] ?? 0)) / 2;
};

const eachPair = <T>(xs: readonly T[]): [T, T][] => xs.flatMap((x, i) => xs.slice(i + 1).map((y): [T, T] => [x, y]));

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

type Evidence = { questions: string[] };

// The answer both students gave wrong, when few others gave it too, is a strong sign of copying.
function wrongAnswerPairs(attempts: readonly AttemptDetail[], questions: readonly Question[]): PairFinding[] {
  const n = attempts.length;
  const rareMax = Math.max(2, Math.ceil(n * 0.1));
  const wrongCount = new Map<string, number>();
  const shared = new Map<string, Evidence>();
  for (const q of questions) {
    if (q.type === "essay" || q.type === "code" || q.type === "sql" || q.type === "drawing") continue;
    const given: { id: string; key: string }[] = [];
    for (const d of attempts) {
      const a = d.answers.find((x) => x.questionId === q.id);
      const key = a && a.correct === false ? answerKey(a.value) : null;
      if (key === null) continue;
      given.push({ id: d.attempt.id, key });
      wrongCount.set(d.attempt.id, (wrongCount.get(d.attempt.id) ?? 0) + 1);
    }
    const groups = new Map<string, string[]>();
    for (const g of given) groups.set(g.key, [...(groups.get(g.key) ?? []), g.id]);
    for (const ids of groups.values()) {
      if (ids.length < 2 || ids.length > rareMax) continue;
      for (const [x, y] of eachPair(ids)) {
        const k = pairKey(x, y);
        const e = shared.get(k) ?? { questions: [] };
        e.questions.push(q.id);
        shared.set(k, e);
      }
    }
  }
  const out: PairFinding[] = [];
  for (const [k, e] of shared) {
    const [a = "", b = ""] = k.split("|");
    const wrong = Math.min(wrongCount.get(a) ?? 0, wrongCount.get(b) ?? 0);
    const count = e.questions.length;
    if (count >= 3 || (count >= 2 && count / Math.max(1, wrong) >= 0.6))
      out.push({
        kind: "wrong_answers",
        a,
        b,
        strength: Math.min(1, count / 4),
        detail: `The same wrong answer on ${count} questions that few others got wrong that way.`,
        questionIds: e.questions,
      });
  }
  return out;
}

// Two students who answered the same questions at the same moments of their own attempts.
function timingPairs(attempts: readonly AttemptDetail[]): PairFinding[] {
  const offsets = attempts.map((d) => {
    const start = Date.parse(d.attempt.startedAt);
    const end = d.attempt.submittedAt ? Date.parse(d.attempt.submittedAt) : Infinity;
    const map = new Map<string, number>();
    for (const a of d.answers) {
      const t = Date.parse(a.answeredAt);
      // Answers written by the submit itself carry the submit time, not the moment the student answered.
      if (a.value === null || Number.isNaN(t) || t >= end - 1000) continue;
      map.set(a.questionId, (t - start) / 1000);
    }
    return { id: d.attempt.id, map };
  });
  const out: PairFinding[] = [];
  for (const [x, y] of eachPair(offsets)) {
    const common = [...x.map.keys()].filter((q) => y.map.has(q));
    if (common.length < 6) continue;
    const close = common.filter((q) => {
      const tx = x.map.get(q) ?? 0;
      const ty = y.map.get(q) ?? 0;
      return tx >= 5 && ty >= 5 && Math.abs(tx - ty) <= 5;
    });
    if (close.length >= 6 && close.length / common.length >= 0.7)
      out.push({
        kind: "timing",
        a: x.id,
        b: y.id,
        strength: close.length / common.length,
        detail: `Answered ${close.length} of ${common.length} shared questions within 5 seconds of each other, from the start of their attempts.`,
        questionIds: close,
      });
  }
  return out;
}

// Answers well under the class's usual time for that question (timeSpentMs is measured in the browser).
function tooFastCounts(attempts: readonly AttemptDetail[], questions: readonly Question[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const q of questions) {
    const times = attempts.flatMap((d) => {
      const t = d.answers.find((a) => a.questionId === q.id)?.timeSpentMs;
      return t === undefined ? [] : [t];
    });
    const typical = median(times);
    if (times.length < 5 || typical < medianFloorMs) continue;
    for (const d of attempts) {
      const a = d.answers.find((x) => x.questionId === q.id);
      if (a?.timeSpentMs !== undefined && a.value !== null && a.timeSpentMs < typical * fastShareOfMedian)
        counts.set(d.attempt.id, (counts.get(d.attempt.id) ?? 0) + 1);
    }
  }
  return counts;
}

function groupPairs(
  attempts: readonly AttemptDetail[],
  kind: "device" | "network",
  keyOf: (d: AttemptDetail) => string | null,
): PairFinding[] {
  const groups = new Map<string, AttemptDetail[]>();
  for (const d of attempts) {
    const k = keyOf(d);
    if (k) groups.set(k, [...(groups.get(k) ?? []), d]);
  }
  const out: PairFinding[] = [];
  for (const members of groups.values()) {
    const distinct = new Set(members.map((m) => m.studentId));
    if (distinct.size < 2) continue;
    // Many students on one address is a lab or campus Wi-Fi, not two people sharing.
    if (kind === "network" && distinct.size > 3) continue;
    for (const [x, y] of eachPair(members)) {
      if (x.studentId === y.studentId) continue;
      out.push({
        kind,
        a: x.attempt.id,
        b: y.attempt.id,
        strength: kind === "device" ? 1 : 0.2,
        detail:
          kind === "device"
            ? "Both started from the same browser."
            : "Both started from the same network address (normal on campus Wi-Fi; flag only).",
        questionIds: [],
      });
    }
  }
  return out;
}

// Points for what a student's own events show. Caps keep one noisy signal from deciding the level.
function eventSignals(report: IntegrityReport, tooFastComputed: number): Signal[] {
  const count = (...types: IntegrityEventType[]) =>
    report.byType.filter((r) => types.includes(r.type)).reduce((n, r) => n + r.count, 0);
  const rows: Signal[] = [];
  const add = (key: string, label: string, points: number) => {
    if (points > 0) rows.push({ key, label, points });
  };
  const left = count("left_page", "switched_app", "alt_tab", "exit_fullscreen");
  add("left", `Left the exam ${left} ${left === 1 ? "time" : "times"}`, Math.min(left, 6));
  const awayMinutes = Math.floor((report.awayMs + report.fullscreenMs) / 120_000);
  add("away_time", "Long time away or out of full screen", Math.min(awayMinutes, 4));
  const gone = count("disconnected");
  add("disconnected", `Disconnected ${gone} ${gone === 1 ? "time" : "times"}`, Math.min(gone, 3) + Math.min(Math.floor(report.disconnectedMs / 120_000), 3));
  add("second_screen", "Second screen connected", Math.min(count("second_screen") * 2, 4));
  add("device", "Switched browser or device", count("device_changed") > 0 ? 4 : 0);
  add("network", "Network address changed", Math.min(count("network_changed") * 2, 4));
  add("attempts", "Tried to copy, paste, print or right-click", Math.min(count("copy", "paste", "drop", "right_click", "print", "screenshot") * 0.5, 3));
  add("bulk", "Text appeared all at once", Math.min(count("bulk_input") * 2, 6));
  add("too_fast", "Answered faster than anyone could read", Math.min(Math.max(count("too_fast"), tooFastComputed), 4));
  add("devtools", "Opened developer tools", count("devtools_open") > 0 ? 3 : 0);
  add("split", "Split screen", count("split_screen") > 0 ? 2 : 0);
  add("resize", "Resized the window", Math.min(count("window_resize") * 0.5, 2));
  add("shared_device", "Shares a browser with another student", count("shared_device") > 0 ? 4 : 0);
  add("shared_network", "Shares a network address with another student", count("shared_network") > 0 ? 1 : 0);
  add("late", "Submitted after the time limit", count("late_submit") > 0 ? 1 : 0);
  return rows;
}

// One attempt's level from its own events alone, for the live view (the comparisons need the finished session).
export function eventsLevel(events: readonly IntegrityEvent[]): IntegrityLevel {
  const score = eventSignals(integrityReport(events), 0).reduce((n, s) => n + s.points, 0);
  return levelOf(score);
}

const pairPoints = (p: PairFinding) => {
  switch (p.kind) {
    case "wrong_answers":
      return 2 + 4 * p.strength;
    case "essay_text":
    case "code":
      return 5;
    case "timing":
      return 3;
    // Shared device and network are scored from the events logged when the attempt started, so they
    // aren't counted a second time here.
    case "device":
    case "network":
      return 0;
  }
};

const pairLabel: Record<PairKind, string> = {
  wrong_answers: "Same rare wrong answers as another student",
  essay_text: "Essay text matches another student",
  code: "Code matches another student",
  timing: "Answered at the same moments as another student",
  device: "Shares a browser with another student",
  network: "Shares a network address with another student",
};

// Checks a session's submitted attempts (one per student) against each other and combines every signal into
// a level per attempt. `typingFlags` is how many of the attempt's typing histories looked pasted or robotic.
export function analyzeSession({
  attempts,
  questions,
  typingFlags = {},
}: {
  attempts: readonly AttemptDetail[];
  questions: readonly Question[];
  typingFlags?: Readonly<Record<string, number>>;
}): SessionIntegrity {
  const pairs: PairFinding[] = [...wrongAnswerPairs(attempts, questions)];

  for (const q of questions) {
    const texts = attempts.map((d) => {
      const v = d.answers.find((a) => a.questionId === q.id)?.value;
      return { id: d.attempt.id, text: typeof v === "string" ? v : "" };
    });
    if (q.type === "essay")
      for (const p of similarTexts(texts, 0.5))
        pairs.push({
          kind: "essay_text",
          a: p.a,
          b: p.b,
          strength: p.score,
          detail: `${Math.round(p.score * 100)}% of their three-word phrases match.`,
          questionIds: [q.id],
        });
    if (q.type === "code")
      for (const p of similarPairs(texts, q.starterCode, sourceKind(q.language), 0.75))
        pairs.push({
          kind: "code",
          a: p.a,
          b: p.b,
          strength: p.score,
          detail: `${Math.round(p.score * 100)}% of their code matches once names and spacing are ignored.`,
          questionIds: [q.id],
        });
  }
  pairs.push(...timingPairs(attempts));
  pairs.push(...groupPairs(attempts, "device", (d) => d.deviceId));
  pairs.push(...groupPairs(attempts, "network", (d) => d.ip));

  const fast = tooFastCounts(attempts, questions);
  const result: Record<string, AttemptIntegrity> = {};
  for (const d of attempts) {
    const id = d.attempt.id;
    const report = integrityReport(d.integrityEvents);
    const signals = eventSignals(report, fast.get(id) ?? 0);
    const flags = typingFlags[id] ?? 0;
    if (flags > 0) signals.push({ key: "typing", label: "Typing looks pasted or automatic", points: Math.min(flags * 3, 6) });
    const mine = pairs.filter((p) => (p.a === id || p.b === id) && pairPoints(p) > 0);
    const pairScore = Math.min(
      mine.reduce((n, p) => n + pairPoints(p), 0),
      10,
    );
    if (pairScore > 0) {
      const kinds = [...new Set(mine.map((p) => p.kind))];
      signals.push({ key: "pairs", label: kinds.map((k) => pairLabel[k]).join("; "), points: pairScore });
    }
    signals.sort((x, y) => y.points - x.points);
    const score = signals.reduce((n, s) => n + s.points, 0);
    result[id] = { attemptId: id, report, score, level: levelOf(score), signals };
  }
  return { attempts: result, pairs: pairs.sort((x, y) => y.strength - x.strength) };
}
