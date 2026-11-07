import { expect, jest, test } from "bun:test";
import type { AnswerValue, IntegrityEvent } from "@examinus/domain/quiz";
import type { PendingStorage } from "./pending-saves.ts";
import { createTakeFlow, type TakeFlowDeps } from "./take-flow.ts";
import type { TakeMode } from "./types.ts";

const memoryStorage = (): PendingStorage & { items: Map<string, string> } => {
  const items = new Map<string, string>();
  return {
    items,
    getItem: async (key) => items.get(key) ?? null,
    setItem: async (key, value) => void items.set(key, value),
    removeItem: async (key) => void items.delete(key),
  };
};

type Saved = { id: string; value: AnswerValue };

// A server that can be switched off (throws, as a lost connection does) or made to refuse.
function fakeServer() {
  const server = {
    online: true,
    refusal: null as string | null,
    markRefusal: null as string | null,
    saved: [] as Saved[],
    marked: [] as { id: string; marked: boolean }[],
    submitted: [] as { answers: unknown; events: IntegrityEvent[] }[],
    log: [] as string[],
    submitRefusal: null as string | null,
    events: [] as IntegrityEvent[][],
    eventsRefusal: null as string | null,
    beats: 0,
    heartbeatRefusal: null as string | null,
  };
  const take: TakeMode = {
    watermark: "",
    onStart: async () => {
      if (!server.online) throw new Error("offline");
      return server.refusal;
    },
    onSave: async (id, value) => {
      if (!server.online) throw new Error("offline");
      if (server.refusal) return server.refusal;
      server.saved.push({ id, value });
      server.log.push(`save ${id}`);
      return null;
    },
    onEvents: async (events) => {
      server.events.push(events);
      return server.eventsRefusal;
    },
    onHeartbeat: async () => {
      server.beats++;
      return server.heartbeatRefusal;
    },
    onGoTo: async (index) => {
      server.log.push(`goTo ${index}`);
      return server.refusal;
    },
    onReload: () => void server.log.push("reload"),
    onMark: async (id, marked) => {
      if (!server.online) throw new Error("offline");
      if (server.markRefusal) return server.markRefusal;
      server.marked.push({ id, marked });
      return null;
    },
    onSubmit: async (answers, events) => {
      if (!server.online) throw new Error("offline");
      if (server.submitRefusal) return server.submitRefusal;
      server.submitted.push({ answers, events });
      return null;
    },
  };
  return { server, take };
}

function setup(over: Partial<TakeFlowDeps> = {}, storage: PendingStorage | null = memoryStorage(), answers = {}) {
  const { server, take } = fakeServer();
  const deps: TakeFlowDeps = {
    take,
    attemptId: "a1",
    unanswered: 0,
    marks: {},
    maxMarked: null,
    questionId: "q1",
    questionTimeUp: false,
    timeSpent: () => 1200,
    ...over,
  };
  const flow = createTakeFlow({ deps: () => deps, storage: storage ?? undefined, answers, typing: {}, saveDelayMs: 0, retrySaveMs: 3_600_000 });
  return { flow, server, deps, storage };
}

const event = (kind: string) => ({ kind }) as unknown as IntegrityEvent;
// Lets the promises the fake timers started finish.
const settle = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

test("an answer is saved with the time the question was on screen, and the state follows", async () => {
  const { flow, server } = setup();
  flow.answer("q1", "x");
  expect(flow.getState().saveState).toBe("saving");
  await flow.flushNow("q1");
  expect(server.saved).toEqual([{ id: "q1", value: "x" }]);
  expect(flow.getState().saveState).toBe("saved");
  flow.dispose();
});

test("the preview has no take: answers stay in the flow and nothing is sent", async () => {
  const { flow, server } = setup({ take: undefined });
  flow.answer("q1", "x");
  await flow.flushNow("q1");
  expect(flow.answers()).toEqual({ q1: "x" });
  expect(server.saved).toEqual([]);
  expect(flow.getState().saveState).toBe("idle");
});

test("offline: the answer is kept on the device, and sent when the network is back", async () => {
  const { flow, server, storage } = setup();
  server.online = false;
  flow.answer("q1", "first");
  await flow.flushNow("q1");
  expect(flow.getState().saveState).toBe("error");
  expect(server.saved).toEqual([]);
  expect(storage && [...(storage as ReturnType<typeof memoryStorage>).items.keys()]).toEqual(["examinus.pending.a1"]);

  server.online = true;
  await flow.sendPending();
  expect(server.saved).toEqual([{ id: "q1", value: "first" }]);
  expect((storage as ReturnType<typeof memoryStorage>).items.size).toBe(0);
  flow.dispose();
});

test("offline: the newest answer of a question replaces the older one, and the waiting one is tried again", async () => {
  const { flow, server } = setup();
  server.online = false;
  flow.answer("q1", "one");
  await flow.flushNow("q1");
  flow.answer("q1", "two");
  server.online = true;
  await flow.flushNow("q1");
  expect(server.saved).toEqual([{ id: "q1", value: "two" }]);
  flow.dispose();
});

test("answers kept by an earlier run come back on resume, for the questions on screen, then go up", async () => {
  const storage = memoryStorage();
  const first = setup({}, storage);
  first.server.online = false;
  first.flow.answer("q1", "kept");
  first.flow.answer("q2", "other");
  await first.flow.flushNow("q1");
  await first.flow.flushNow("q2");
  first.flow.dispose();

  const next = setup({}, storage);
  const recovered = await next.flow.resume(new Set(["q1"]));
  expect(recovered).toEqual({ q1: "kept" });
  expect(next.flow.answers()).toEqual({ q1: "kept" });
  await next.flow.sendPending();
  expect(next.server.saved.map((s) => s.id).sort()).toEqual(["q1", "q2"]);
  expect(storage.items.size).toBe(0);
});

test("without storage an offline answer is only retried, never kept", async () => {
  const { flow, server } = setup({}, null);
  server.online = false;
  flow.answer("q1", "x");
  await flow.flushNow("q1");
  expect(await flow.resume()).toEqual({});
  server.online = true;
  await flow.flushNow("q1");
  expect(server.saved).toEqual([{ id: "q1", value: "x" }]);
  flow.dispose();
});

test("time is up: a refused save tells the student and hands in what there is, without asking", async () => {
  const { flow, server } = setup({ unanswered: 3 });
  flow.answer("q1", "late");
  server.refusal = "Time is up.";
  await flow.flushNow("q1");
  expect(flow.getState().lateNotice).toBe("Time is up.");
  expect(server.submitted).toHaveLength(1);
  expect(server.submitted[0]!.answers).toEqual({ q1: "late" });
  expect(flow.getState().submitting).toBe(true);
  flow.dispose();
});

test("a forced submit hands in even when a drawing could not be uploaded; a confirmed one stops", async () => {
  const { flow, server } = setup();
  flow.registerDrawing("d", async () => {
    throw new Error("no network");
  });
  const stopped = await flow.submit({ confirmed: true });
  expect(stopped).toEqual({ status: "failed", error: "Your drawing couldn't be uploaded: no network. Check your connection and try again." });
  expect(flow.getState().submitting).toBe(false);
  expect(server.submitted).toHaveLength(0);

  expect(await flow.submit({ forced: true })).toEqual({ status: "submitted" });
  expect(server.submitted).toHaveLength(1);
});

test("unanswered questions ask first, once; nothing is touched until it is confirmed", async () => {
  const { flow, server } = setup({ unanswered: 1 });
  flow.answer("q1", "x");
  const asked = await flow.submit({ events: [] });
  expect(asked).toEqual({ status: "confirm", message: "1 question is unanswered. Submit anyway?" });
  expect(flow.getState().submitting).toBe(false);
  expect(await flow.submit({ confirmed: true, events: [] })).toEqual({ status: "submitted" });
  expect(server.submitted).toHaveLength(1);
});

test("the submit starts finalizing before the drawings go up, and the waiting saves are dropped", async () => {
  const { flow, server } = setup();
  let finalizingDuringUpload: boolean | null = null;
  flow.registerDrawing("d", async () => {
    finalizingDuringUpload = flow.getState().submitting;
  });
  flow.answer("q1", "typed");
  await flow.submit();
  expect(finalizingDuringUpload as boolean | null).toBe(true);
  await flow.flushNow("q1");
  expect(server.saved).toEqual([]);
  expect(server.submitted[0]!.answers).toEqual({ q1: "typed" });
});

test("the submit sends the events the server doesn't have yet, and clears what the device kept", async () => {
  const { flow, server, storage } = setup();
  const all = [event("a"), event("b"), event("c")];
  // The server has the first two once the link has run.
  flow.bindEvents({ finish: () => all, pending: (from) => ({ events: all.slice(from, 2), end: Math.max(from, 2) }) });
  jest.useFakeTimers();
  const stop = flow.link.run({});
  jest.advanceTimersByTime(1000);
  await settle();
  stop();
  jest.useRealTimers();
  server.online = false;
  flow.answer("q1", "x");
  await flow.flushNow("q1");
  server.online = true;
  await flow.submit();
  expect(server.submitted[0]!.events).toEqual([event("c")]);
  expect((storage as ReturnType<typeof memoryStorage>).items.size).toBe(0);
});

// The attempt link runs on timers: events every second, a check-in every 15 s.
function linkSetup(over: Partial<TakeFlowDeps> = {}) {
  const made = setup(over);
  const log: IntegrityEvent[] = [];
  made.flow.bindEvents({ finish: () => log, pending: (from) => ({ events: log.slice(from), end: log.length }) });
  jest.useFakeTimers();
  return { ...made, log };
}

test("link: events go up once, and only what is new goes next", async () => {
  const { flow, server, log } = linkSetup();
  const stop = flow.link.run({});
  log.push(event("a"), event("b"));
  jest.advanceTimersByTime(1000);
  await settle();
  jest.advanceTimersByTime(3000);
  await settle();
  expect(server.events).toEqual([[event("a"), event("b")]]);
  log.push(event("c"));
  jest.advanceTimersByTime(1000);
  await settle();
  expect(server.events).toEqual([[event("a"), event("b")], [event("c")]]);
  stop();
  jest.useRealTimers();
});

test("link: events the server didn't record are sent again", async () => {
  const { flow, server, log } = linkSetup();
  const stop = flow.link.run({});
  log.push(event("a"));
  server.eventsRefusal = "Not recorded.";
  jest.advanceTimersByTime(1000);
  await settle();
  server.eventsRefusal = null;
  jest.advanceTimersByTime(1000);
  await settle();
  expect(server.events).toEqual([[event("a")], [event("a")]]);
  jest.advanceTimersByTime(1000);
  await settle();
  expect(server.events).toHaveLength(2);
  stop();
  jest.useRealTimers();
});

test("link: nothing is sent or checked in once the submit is under way", async () => {
  const { flow, server, log } = linkSetup();
  const stop = flow.link.run({});
  expect(server.beats).toBe(1);
  // A drawing that never finishes uploading keeps the submit under way.
  flow.registerDrawing("d", () => new Promise<void>(() => {}));
  void flow.submit({ events: [] });
  log.push(event("a"));
  jest.advanceTimersByTime(30_000);
  await settle();
  expect(server.events).toEqual([]);
  expect(server.beats).toBe(1);
  stop();
  jest.useRealTimers();
});

test("link: the check-in runs at once, every 15 s, when the app wakes, and tells the screen about a refusal", async () => {
  const { flow, server } = linkSetup();
  const refusals: (string | null)[] = [];
  let wake = () => {};
  let unwoken = false;
  const stop = flow.link.run({
    onRefused: (message) => refusals.push(message),
    onWake: (beat) => {
      wake = beat;
      return () => void (unwoken = true);
    },
  });
  await settle();
  expect(server.beats).toBe(1);
  jest.advanceTimersByTime(14_999);
  expect(server.beats).toBe(1);
  jest.advanceTimersByTime(1);
  expect(server.beats).toBe(2);
  wake();
  expect(server.beats).toBe(3);
  server.heartbeatRefusal = "Another browser.";
  jest.advanceTimersByTime(15_000);
  await settle();
  expect(refusals).toEqual([null, null, null, "Another browser."]);
  stop();
  expect(unwoken).toBe(true);
  jest.advanceTimersByTime(60_000);
  expect(server.beats).toBe(4);
  jest.useRealTimers();
});

test("a failed submit can be tried again; offline says so", async () => {
  const { flow, server } = setup();
  server.online = false;
  const outcome = await flow.submit();
  expect(outcome).toEqual({ status: "failed", error: "Couldn't reach the server. Check your connection and submit again." });
  expect(flow.getState().submitting).toBe(false);
  expect(flow.getState().submitError).toBe(outcome.status === "failed" ? outcome.error : null);
  server.online = true;
  expect(await flow.submit()).toEqual({ status: "submitted" });
  expect(flow.getState().submitError).toBeNull();
});

test("the exam's deadline submits once, and not while a submit is under way", async () => {
  const { flow, server } = setup({ unanswered: 2 });
  await flow.deadlineReached();
  await flow.deadlineReached();
  expect(server.submitted).toHaveLength(1);
});

test("mark limit: a mark over the limit is refused before the server is asked; clearing one is not", async () => {
  const { flow, server } = setup({ marks: { a: true, b: true }, maxMarked: 2 });
  expect(await flow.mark("c", true)).toMatch(/2/);
  expect(server.marked).toEqual([]);
  expect(await flow.mark("a", false)).toBeNull();
  expect(server.marked).toEqual([{ id: "a", marked: false }]);
});

test("mark: the server's refusal and a lost connection come back as messages", async () => {
  const { flow, server } = setup();
  server.markRefusal = "No more marks.";
  expect(await flow.mark("a", true)).toBe("No more marks.");
  server.online = false;
  expect(await flow.mark("a", true)).toBe("Couldn't reach the server. Check your connection and try again.");
  expect(flow.getState().markBusy).toBe(false);
});

test("mark in the preview only checks the limit", async () => {
  const { flow } = setup({ take: undefined, marks: { a: true }, maxMarked: 1 });
  expect(await flow.mark("b", true)).not.toBeNull();
  expect(await flow.mark("b", false)).toBeNull();
});

test("late conflict while sending what the device kept: the student is told, the rest stays, nothing is handed in", async () => {
  const { flow, server, storage } = setup();
  server.online = false;
  flow.answer("q1", "a");
  flow.answer("q2", "b");
  await flow.flushNow("q1");
  await flow.flushNow("q2");
  server.online = true;
  server.refusal = "The attempt is over.";
  await flow.sendPending();
  expect(flow.getState().lateNotice).toBe("The attempt is over.");
  expect(server.submitted).toHaveLength(0);
  // The refused answer is dropped, the one after it was not tried.
  expect(JSON.parse((storage as ReturnType<typeof memoryStorage>).items.get("examinus.pending.a1")!)).toEqual({ q2: { value: "b", timeSpentMs: 1200 } });
  flow.dispose();
});

test("leaving a question saves its answer first, then the server moves", async () => {
  const { flow, server } = setup();
  flow.answer("q1", "x");
  expect(await flow.goTo(2)).toEqual({ status: "moved" });
  expect(server.log).toEqual(["save q1", "goTo 2"]);
});

test("leaving a question stops on a failed drawing, unless the question's time is up", async () => {
  const { flow, server, deps } = setup();
  flow.registerDrawing("d", async () => {
    throw new Error("no network");
  });
  const stopped = await flow.goTo(1);
  expect(stopped.status).toBe("drawing");
  expect(flow.getState().moving).toBe(false);
  expect(server.log).toEqual([]);

  deps.questionTimeUp = true;
  expect(await flow.goTo(1)).toEqual({ status: "moved" });
  expect(server.log).toEqual(["goTo 1"]);
});

test("leaving a question: a refusal or a lost connection is why not, and a second move while one is under way is ignored", async () => {
  const { flow, server } = setup();
  server.refusal = "You can't go back.";
  expect(await flow.goTo(0)).toEqual({ status: "refused", error: "You can't go back." });
  server.refusal = null;
  const [first, second] = await Promise.all([flow.goTo(1), flow.goTo(2)]);
  expect(first).toEqual({ status: "moved" });
  expect(second).toEqual({ status: "busy" });
});

test("a question's time running out reads the paper again, or hands in on the last question", async () => {
  const { flow, server } = setup();
  await flow.questionTimeUp(false);
  expect(server.log).toEqual(["reload"]);
  await flow.questionTimeUp(true);
  expect(server.submitted).toHaveLength(1);
  await flow.questionTimeUp(false);
  expect(server.log).toEqual(["reload"]);
});

test("start: the room password and the device are checked first, and the click's preparation runs once", async () => {
  const { flow, server } = setup();
  const prepared: string[] = [];
  const prepare = () => void prepared.push("go");
  expect(await flow.start({ roomPassword: " ", passwordRequired: true, prepare })).toBe("Type the room password your teacher gave you.");
  expect(await flow.start({ roomPassword: "x", passwordRequired: true, check: () => "Disconnect the second screen.", prepare })).toBe("Disconnect the second screen.");
  expect(flow.getState().startError).toBe("Disconnect the second screen.");
  expect(prepared).toEqual([]);

  expect(await flow.start({ roomPassword: "x", passwordRequired: true, prepare })).toBeNull();
  expect(prepared).toEqual(["go"]);
  expect(flow.getState()).toMatchObject({ starting: true, startError: null });

  server.refusal = "Wrong password.";
  expect(await flow.start({ roomPassword: "x", passwordRequired: true })).toBe("Wrong password.");
  expect(flow.getState()).toMatchObject({ starting: false, startError: "Wrong password." });
  server.refusal = null;
  server.online = false;
  expect(await flow.start({ roomPassword: "", passwordRequired: false })).toBe("Couldn't reach the server. Check your connection and try again.");
});
