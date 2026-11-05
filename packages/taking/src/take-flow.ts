import type { AnswerValue, IntegrityEvent } from "@examinus/domain/quiz";
import { markLimitMessage } from "@examinus/domain/review";
import { pendingSaves, type PendingSave, type PendingStorage } from "./pending-saves.ts";
import type { Answers, DrawingFinalizer, ServedTyping, TakeMode, Typing } from "./types.ts";

const saveDelayMs = 800;
const retrySaveMs = 5000;
const offlineMessage = "Couldn't reach the server. Check your connection and try again.";
const offlineSubmitMessage = "Couldn't reach the server. Check your connection and submit again.";

export type SaveState = "idle" | "saving" | "saved" | "error";

// What the screen shows of the flow.
export type TakeFlowState = {
  saveState: SaveState;
  starting: boolean;
  startError: string | null;
  submitting: boolean;
  submitError: string | null;
  // One question at a time: the student is leaving a question (its drawing and answer go up first).
  moving: boolean;
  markBusy: boolean;
  // The server refused an answer (time is up): the message for the student.
  lateNotice: string | null;
};

// The integrity log the submit and the check-in read: `finish` closes an away event that is still open and returns
// every event; `pending` is what the server doesn't have yet after the first `sent` events.
export type EventSource = {
  finish(): IntegrityEvent[];
  pending(sent: number): { events: IntegrityEvent[]; end: number };
};

// What the screen knows right now; read when the flow needs it, so it is always the latest render's.
export type TakeFlowDeps = {
  // Missing in the teacher's preview: nothing is saved or sent.
  take: TakeMode | undefined;
  attemptId: string | undefined;
  unanswered: number;
  marks: Record<string, boolean>;
  maxMarked: number | null;
  // One question at a time: the question on screen, and whether its time ran out.
  questionId: string | undefined;
  questionTimeUp: boolean;
  timeSpent: (questionId: string) => number;
};

export type SubmitOutcome = { status: "confirm"; message: string } | { status: "submitted" } | { status: "failed"; error: string };
export type LeaveOutcome = { status: "busy" } | { status: "moved" } | { status: "drawing"; error: string } | { status: "refused"; error: string };

type Sent = { kind: "saved" } | { kind: "offline" } | { kind: "refused"; message: string };

// Everything between a taking screen and its `TakeMode`, in one place so the web and the phone behave the same:
// - Answers are saved as they change, one question at a time: a moment after the last keystroke the answer goes
//   up with its typing history and the time the question was on screen. When the server can't be reached the answer
//   is kept (on the device too, when there is `storage`) and sent again. When the server no longer takes answers
//   (time is up) the student is told and what there is gets handed in.
// - A submit sets `finalizing` before anything is uploaded, so no save or check-in races it, drops the waiting
//   saves (the submit carries every answer) and uploads the drawings first. `forced` (time ran out, too many
//   warnings) skips the confirmation and hands in even if a drawing didn't upload.
// - Marks, leaving a question and starting go through here too.
export type TakeFlow = {
  getState(): TakeFlowState;
  subscribe(listener: () => void): () => void;
  take(): TakeMode | undefined;
  // Whether the submit is under way: nothing is retried or checked in.
  finalizing(): boolean;
  // How many of the integrity events the server already has.
  sentEvents: { current: number };
  bindEvents(source: EventSource): void;
  pendingEvents(from: number): { events: IntegrityEvent[]; end: number };
  // The newest answers, and the typing history the screen appends to (`logTyped`, `logEdits`).
  answers(): Answers;
  typing: Typing;
  // What the server has for the question now on screen (one question at a time) joins what will be submitted.
  merge(served: Answers, servedTyping: ServedTyping): void;
  // Each drawing question's "upload the latest picture" function, registered while it is on screen.
  registerDrawing(id: string, finalize: DrawingFinalizer | null): void;
  // The student changed an answer: it is kept and saved a moment later.
  answer(id: string, value: AnswerValue): void;
  // Sends the question's waiting answer now.
  flushNow(id: string): Promise<void>;
  // The answers kept on the device from a run that couldn't reach the server, to show. One question at a time, only
  // those of `only` (the questions now on screen). Then `sendPending` sends them.
  resume(only?: ReadonlySet<string>): Promise<Answers>;
  // Sends the answers kept on the device now that the network may be back. Stops quietly while the server is
  // unreachable, and at a refusal (time is up), which the student is told.
  sendPending(): Promise<void>;
  // `forced`: time ran out or too many warnings, so no confirmation. `events`: all of them, when the guard hands
  // them in itself. Without `confirmed`, unanswered questions ask first (`status: "confirm"`).
  submit(options?: { forced?: boolean; confirmed?: boolean; events?: IntegrityEvent[] }): Promise<SubmitOutcome>;
  // The exam's time ran out: the answers are handed in, unless that is already under way.
  deadlineReached(): Promise<void>;
  // One question at a time: opens question `index` (0-based) after saving this one.
  goTo(index: number): Promise<LeaveOutcome>;
  // The question's time ran out: the server has moved on, so the page reads where to (the last question submits).
  // Returns how the move went, or null when the paper was handed in (or that is already under way).
  questionTimeUp(isLast: boolean): Promise<LeaveOutcome | null>;
  // Marks a question for review, or clears the mark; returns why not (the limit, or the server's refusal).
  mark(id: string, marked: boolean): Promise<string | null>;
  // The Start button. `check`: why this device can't start (a second screen, a missing lock), or null. `prepare`
  // runs first thing, in the click (full screen, clearing the clipboard). Returns why not, or null; the page then
  // reads the paper again, which has the attempt.
  start(options: { roomPassword: string; passwordRequired: boolean; check?: () => string | null; prepare?: () => void | Promise<void> }): Promise<string | null>;
  dispose(): void;
};

export function createTakeFlow({
  deps,
  storage,
  answers,
  typing,
  saveDelayMs: delayMs = saveDelayMs,
  retrySaveMs: retryMs = retrySaveMs,
}: {
  deps: () => TakeFlowDeps;
  // Where answers that couldn't be sent are kept between runs. None in the browser.
  storage?: PendingStorage | undefined;
  // What the server already has.
  answers: Answers;
  typing: ServedTyping;
  saveDelayMs?: number;
  retrySaveMs?: number;
}): TakeFlow {
  const store = storage && pendingSaves(storage);
  // The newest answers, for what runs after an await (a drawing upload finishing, the final submit).
  let live: Answers = { ...answers };
  // Edits to typed answers, timed from the start, for the teacher's typing replay.
  const typingLog: Typing = Object.fromEntries(Object.entries(typing).map(([id, edits]) => [id, [...edits]]));
  const sentEvents = { current: 0 };
  const drawings = new Map<string, DrawingFinalizer>();
  const waiting = new Map<string, AnswerValue>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  let inflight = 0;
  let finalizing = false;
  let moving = false;
  let events: EventSource | undefined;

  let state: TakeFlowState = {
    saveState: "idle",
    starting: false,
    startError: null,
    submitting: false,
    submitError: null,
    moving: false,
    markBusy: false,
    lateNotice: null,
  };
  const listeners = new Set<() => void>();
  const set = (patch: Partial<TakeFlowState>) => {
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  };

  const saveOf = (id: string, value: AnswerValue): PendingSave => {
    const edits = typingLog[id];
    const timeSpentMs = deps().timeSpent(id);
    return { value, ...(edits ? { typing: edits } : {}), timeSpentMs };
  };

  // Sends one answer. `keep`: when the server can't be reached, keeps it in the storage.
  async function send(id: string, save: PendingSave, keep: boolean): Promise<Sent> {
    const { take, attemptId } = deps();
    if (!take) return { kind: "offline" };
    let error: string | null;
    try {
      error = await take.onSave(id, save.value, save.typing, save.timeSpentMs);
    } catch {
      if (store && attemptId && keep) await store.put(attemptId, id, save).catch(() => undefined);
      return { kind: "offline" };
    }
    // Saved, or refused for good: nothing left to keep.
    if (store && attemptId) await store.settle(attemptId, id, save.value).catch(() => undefined);
    return error ? { kind: "refused", message: error } : { kind: "saved" };
  }

  async function flush(id: string) {
    timers.delete(id);
    const value = waiting.get(id);
    if (value === undefined || !deps().take) return;
    waiting.delete(id);
    inflight++;
    const sent = await send(id, saveOf(id, value), true);
    inflight--;
    if (sent.kind === "offline") {
      set({ saveState: "error" });
      // Keep trying, unless a newer answer is already waiting.
      if (!waiting.has(id) && !finalizing) {
        waiting.set(id, value);
        timers.set(id, setTimeout(() => void flush(id), retryMs));
      }
    } else if (sent.kind === "refused") {
      // The server stopped taking answers (time is up): hand in what we have.
      set({ saveState: "error", lateNotice: sent.message });
      if (!finalizing) await submit({ forced: true });
    } else if (inflight === 0 && timers.size === 0) set({ saveState: "saved" });
  }

  // Sends the question's waiting answer now (moving to another question).
  function flushNow(id: string) {
    clearTimeout(timers.get(id));
    return flush(id);
  }

  // Drops what is waiting: the submit sends every answer itself.
  function discard() {
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
    waiting.clear();
  }

  // Uploads the latest picture of every drawing on screen; returns a message for the student if one fails.
  async function settleDrawings(): Promise<string | null> {
    let failure: string | null = null;
    await Promise.all(
      [...drawings.values()].map((finalize) =>
        finalize().catch((e: unknown) => {
          failure = `Your drawing couldn't be uploaded: ${e instanceof Error ? e.message : "try again"}. Check your connection and try again.`;
        }),
      ),
    );
    return failure;
  }

  async function submit({ forced = false, confirmed = false, events: given }: { forced?: boolean; confirmed?: boolean; events?: IntegrityEvent[] } = {}): Promise<SubmitOutcome> {
    const { take, unanswered } = deps();
    if (!take) return { status: "failed", error: offlineSubmitMessage };
    if (!forced && !confirmed && unanswered > 0)
      return { status: "confirm", message: `${unanswered} ${unanswered === 1 ? "question is" : "questions are"} unanswered. Submit anyway?` };
    // The events so far, with an away event that is still open closed at this moment.
    const all = given ?? events?.finish() ?? [];
    // Set before the drawings go up, so no save or check-in races the submit.
    finalizing = true;
    discard();
    set({ submitting: true, submitError: null });
    // The drawing's latest picture goes up first, so the final answers carry it. When time is up the answers go in
    // as they are: the teacher can still replay the saved strokes.
    const drawingError = await settleDrawings();
    if (drawingError && !forced) {
      finalizing = false;
      set({ submitError: drawingError, submitting: false });
      return { status: "failed", error: drawingError };
    }
    let error: string | null;
    try {
      error = await take.onSubmit(live, all.slice(sentEvents.current), typingLog);
    } catch {
      error = offlineSubmitMessage;
    }
    if (error) {
      finalizing = false;
      set({ submitError: error, submitting: false });
      return { status: "failed", error };
    }
    const { attemptId } = deps();
    if (store && attemptId) await store.clear(attemptId).catch(() => undefined);
    return { status: "submitted" };
  }

  // One question at a time: opening another question saves this one first (its drawing too, so the teacher sees
  // what the student left), then `move` asks the server and the page re-reads the paper.
  async function leave(move: (take: TakeMode) => Promise<string | null>): Promise<LeaveOutcome> {
    const { take, questionId } = deps();
    if (!take || moving || questionId === undefined) return { status: "busy" };
    moving = true;
    set({ moving: true });
    const done = (outcome: LeaveOutcome) => {
      moving = false;
      set({ moving: false });
      return outcome;
    };
    const drawingError = await settleDrawings();
    if (drawingError && !deps().questionTimeUp) return done({ status: "drawing", error: drawingError });
    await flushNow(questionId).catch(() => undefined);
    let error: string | null;
    try {
      error = await move(take);
    } catch {
      error = offlineMessage;
    }
    return done(error ? { status: "refused", error } : { status: "moved" });
  }

  return {
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },

    take: () => deps().take,
    // Whether the submit is under way: nothing is retried or checked in.
    finalizing: () => finalizing,
    // How many of the integrity events the server already has.
    sentEvents,
    bindEvents(source: EventSource) {
      events = source;
    },
    pendingEvents: (from: number) => events?.pending(from) ?? { events: [], end: from },

    // The newest answers, and the typing history the screen appends to (`logTyped`, `logEdits`).
    answers: () => live,
    typing: typingLog,
    // What the server has for the question now on screen (one question at a time) joins what will be submitted.
    merge(served: Answers, servedTyping: ServedTyping) {
      live = { ...live, ...served };
      for (const [id, edits] of Object.entries(servedTyping)) typingLog[id] ??= [...edits];
    },

    // Each drawing question's "upload the latest picture" function, registered while it is on screen.
    registerDrawing(id: string, finalize: DrawingFinalizer | null) {
      if (finalize) drawings.set(id, finalize);
      else drawings.delete(id);
    },

    // The student changed an answer: it is kept and saved a moment later.
    answer(id: string, value: AnswerValue) {
      live = { ...live, [id]: value };
      if (!deps().take) return;
      waiting.set(id, value);
      clearTimeout(timers.get(id));
      timers.set(id, setTimeout(() => void flush(id), delayMs));
      set({ saveState: "saving" });
    },
    flushNow,

    // The answers kept on the device from a run that couldn't reach the server, to show. One question at a time, only
    // those of `only` (the questions now on screen). Then `sendPending` sends them.
    async resume(only?: ReadonlySet<string>): Promise<Answers> {
      const { attemptId } = deps();
      if (!store || !attemptId) return {};
      const kept = await store.load(attemptId);
      const mine = Object.entries(kept).filter(([id]) => !only || only.has(id));
      const recovered: Answers = Object.fromEntries(mine.map(([id, save]) => [id, save.value]));
      live = { ...live, ...recovered };
      return recovered;
    },
    // Sends the answers kept on the device now that the network may be back. Stops quietly while the server is
    // unreachable, and at a refusal (time is up), which the student is told.
    async sendPending() {
      const { attemptId } = deps();
      if (!store || !attemptId || !deps().take) return;
      for (const [id, save] of Object.entries(await store.load(attemptId))) {
        const sent = await send(id, save, false);
        if (sent.kind === "offline") return;
        if (sent.kind === "refused") return set({ lateNotice: sent.message });
      }
    },

    submit,
    // The exam's time ran out: the answers are handed in, unless that is already under way.
    deadlineReached: () => (finalizing ? Promise.resolve() : submit({ forced: true }).then(() => undefined)),
    goTo: (index: number) => leave((take) => take.onGoTo(index)),
    // The question's time ran out: the server has moved on, so the page reads where to (the last question submits).
    async questionTimeUp(isLast: boolean) {
      if (finalizing) return null;
      if (isLast) {
        await submit({ forced: true });
        return null;
      }
      return leave(async (take) => {
        take.onReload();
        return null;
      });
    },

    // Marks a question for review, or clears the mark; returns why not (the limit, or the server's refusal).
    async mark(id: string, marked: boolean): Promise<string | null> {
      const { take, marks, maxMarked } = deps();
      if (marked && maxMarked !== null && Object.values(marks).filter(Boolean).length >= maxMarked) return markLimitMessage(maxMarked);
      if (!take) return null;
      set({ markBusy: true });
      let error: string | null;
      try {
        error = await take.onMark(id, marked);
      } catch {
        error = offlineMessage;
      }
      set({ markBusy: false });
      return error;
    },

    // The Start button. `check`: why this device can't start (a second screen, a missing lock), or null. `prepare`
    // runs first thing, in the click (full screen, clearing the clipboard). Returns why not, or null; the page then
    // reads the paper again, which has the attempt.
    async start({ roomPassword, passwordRequired, check, prepare }: { roomPassword: string; passwordRequired: boolean; check?: () => string | null; prepare?: () => void | Promise<void> }): Promise<string | null> {
      const { take } = deps();
      if (!take) return null;
      const refusal = check?.() ?? (passwordRequired && roomPassword.trim() === "" ? "Type the room password your teacher gave you." : null);
      if (refusal !== null) {
        set({ startError: refusal });
        return refusal;
      }
      set({ startError: null, starting: true });
      await prepare?.();
      let error: string | null;
      try {
        error = await take.onStart(roomPassword);
      } catch {
        error = offlineMessage;
      }
      if (error) set({ starting: false, startError: error });
      return error;
    },

    dispose() {
      for (const timer of timers.values()) clearTimeout(timer);
    },
  };
}

