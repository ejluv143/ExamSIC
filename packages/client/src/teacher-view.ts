// The teacher's view of one running session, as pure state: feed it the events of the teacher stream and read rows,
// answers, approvals and alerts back. React-free; the web hook (`useTeacherView`) only holds the state and runs the
// requests that `reduce` asks for. Looking up a student's last device change needs the server, so it is a request in
// the result and `deviceChangeFound` is how the answer comes back.
import type { Incident, LiveStudent, LiveTeacherEvent } from "@examinus/contract/live";
import type { AnswerValue, IntegrityEventType, Session } from "@examinus/domain/quiz";

// An alert older than this when it arrives (a reconnect replaying the stream) is not worth interrupting for.
export const freshAlertMs = 120_000;
export const maxToasts = 5;

// The alerts of a monitored session that interrupt the teacher the moment they arrive. Blocked copy and paste, the mouse
// leaving the page and window resizes are only logged.
export const toastTypes: Partial<Record<IntegrityEventType, true>> = {
  exit_fullscreen: true,
  left_page: true,
  switched_app: true,
  alt_tab: true,
  second_screen: true,
  device_changed: true,
  auto_submitted: true,
  devtools_open: true,
  split_screen: true,
  print: true,
  screenshot: true,
  rooted_device: true,
  emulator: true,
  vm_detected: true,
  kiosk_exited: true,
  screen_recording: true,
  overlay_detected: true,
};

export type Toast = { id: string; attemptId: string; type: IntegrityEventType; at: string };

// Teacher actions that let a held exam attempt continue.
const approvals: Partial<Record<Incident["kind"], true>> = { device_switch_allowed: true, allow_back_in: true };

// What the view tracks beyond the rows. Exams hold attempts for approval; any session with anti-cheating on
// (a quiz that tracks tabs or blocks copying) reports alerts the same way an exam does.
export type Watch = { readonly exam: boolean; readonly monitored: boolean };

export const watchFor = (session: Session): Watch => ({
  exam: session.mode === "exam",
  monitored: session.mode === "exam" || session.integrity.trackFocus || session.integrity.requireFullscreen,
});

export type TeacherView = {
  readonly watch: Watch;
  // Null until the first event of the stream, for a caller that wasn't given the session.
  readonly session: Session | null;
  readonly rows: Readonly<Record<string, LiveStudent>>;
  readonly incidents: readonly Incident[];
  // The latest saved value of each answer, by attempt then question, and the question changed last.
  readonly values: Readonly<Record<string, Readonly<Record<string, AnswerValue>>>>;
  readonly changed: Readonly<Record<string, string>>;
  // Counts events per attempt, so an open panel knows to read the attempt again.
  readonly pulses: Readonly<Record<string, number>>;
  // When each attempt last changed device and was last approved by the teacher.
  readonly waitingAt: Readonly<Record<string, string>>;
  readonly approvedAt: Readonly<Record<string, string>>;
  readonly toasts: readonly Toast[];
};

export const startTeacherView = (watch: Watch, session: Session | null = null): TeacherView => ({
  watch,
  session,
  rows: {},
  incidents: [],
  values: {},
  changed: {},
  pulses: {},
  waitingAt: {},
  approvedAt: {},
  toasts: [],
});

// Asks the caller to find when this attempt last changed device; the answer goes to `deviceChangeFound`.
export type DeviceChangeRequest = { readonly attemptId: string };

export type Step = { readonly view: TeacherView; readonly requests: readonly DeviceChangeRequest[] };

const bump = (pulses: TeacherView["pulses"], ids: readonly string[]) => {
  const next = { ...pulses };
  for (const id of ids) next[id] = (next[id] ?? 0) + 1;
  return next;
};

// `now` is when the event arrived, in epoch milliseconds: it decides which alerts are fresh.
export function reduce(view: TeacherView, event: LiveTeacherEvent, now: number): Step {
  switch (event._tag) {
    case "snapshot": {
      const next: TeacherView = {
        ...view,
        session: event.session,
        rows: Object.fromEntries(event.students.map((s) => [s.studentId, s])),
        incidents: event.incidents,
        values: {},
        changed: {},
        pulses: bump(view.pulses, event.students.flatMap((s) => s.attemptId ?? [])),
      };
      if (!view.watch.exam) return { view: next, requests: [] };
      const approvedAt: Record<string, string> = {};
      for (const i of event.incidents)
        if (i.attemptId && approvals[i.kind] && (approvedAt[i.attemptId] ?? "") < i.at) approvedAt[i.attemptId] = i.at;
      // The snapshot has no integrity events: the attempts still open and with alerts need their device change read.
      const requests = event.students.flatMap((s) =>
        s.attemptId && !s.submittedAt && s.alerts > 0 ? [{ attemptId: s.attemptId }] : [],
      );
      return { view: { ...next, approvedAt }, requests };
    }
    case "student":
      return {
        view: {
          ...view,
          rows: { ...view.rows, [event.student.studentId]: event.student },
          pulses: event.student.attemptId ? bump(view.pulses, [event.student.attemptId]) : view.pulses,
        },
        requests: [],
      };
    case "answer":
      return {
        view: {
          ...view,
          values: {
            ...view.values,
            [event.attemptId]: { ...view.values[event.attemptId], [event.questionId]: event.value },
          },
          changed: { ...view.changed, [event.attemptId]: event.questionId },
          pulses: bump(view.pulses, [event.attemptId]),
        },
        requests: [],
      };
    case "integrity": {
      const pulses = bump(view.pulses, [event.attemptId]);
      if (!view.watch.monitored) return { view: { ...view, pulses }, requests: [] };
      const fresh = event.events.filter((e) => now - Date.parse(e.at) < freshAlertMs);
      const change = fresh.filter((e) => e.type === "device_changed").map((e) => e.at).sort().at(-1);
      const added = fresh
        .filter((e) => toastTypes[e.type])
        .map((e): Toast => ({ id: `${event.attemptId}-${e.type}-${e.at}`, attemptId: event.attemptId, type: e.type, at: e.at }))
        .filter((t, i, all) => all.findIndex((o) => o.id === t.id) === i && !view.toasts.some((p) => p.id === t.id));
      return {
        view: {
          ...view,
          pulses,
          waitingAt: change ? { ...view.waitingAt, [event.attemptId]: change } : view.waitingAt,
          toasts: added.length > 0 ? [...view.toasts, ...added].slice(-maxToasts) : view.toasts,
        },
        requests: [],
      };
    }
    case "incident": {
      const { incident } = event;
      const incidents = view.incidents.some((i) => i.id === incident.id) ? view.incidents : [...view.incidents, incident];
      const { attemptId } = incident;
      if (!attemptId) return { view: { ...view, incidents }, requests: [] };
      return {
        view: {
          ...view,
          incidents,
          pulses: bump(view.pulses, [attemptId]),
          approvedAt: approvals[incident.kind] ? { ...view.approvedAt, [attemptId]: incident.at } : view.approvedAt,
        },
        requests: [],
      };
    }
    case "session":
      return { view: { ...view, session: event.session }, requests: [] };
  }
}

// The answer to a `DeviceChangeRequest`: the time of that attempt's last device change, if it ever had one.
export const deviceChangeFound = (view: TeacherView, attemptId: string, at: string | undefined): TeacherView =>
  at === undefined ? view : { ...view, waitingAt: { ...view.waitingAt, [attemptId]: at } };

export const dismissToast = (view: TeacherView, id: string): TeacherView => ({
  ...view,
  toasts: view.toasts.filter((t) => t.id !== id),
});

// An exam student is waiting for approval when their last device change is newer than the last approval.
export function isWaiting(view: TeacherView, attemptId: string | null): boolean {
  if (attemptId === null) return false;
  const changed = view.waitingAt[attemptId];
  if (changed === undefined) return false;
  const approved = view.approvedAt[attemptId];
  return approved === undefined || Date.parse(changed) > Date.parse(approved);
}

// A student who hasn't started has no attempt yet.
export const placeholderStudent = (studentId: string, questionCount: number): LiveStudent => ({
  studentId,
  joinedAt: null,
  attemptId: null,
  status: null,
  startedAt: null,
  submittedAt: null,
  lastSeenAt: null,
  answered: 0,
  questionCount,
  marked: 0,
  questionIndex: 0,
  questionStartedAt: null,
  currentQuestionId: null,
  score: 0,
  max: 0,
  alerts: 0,
  awayMs: 0,
  level: "low",
  locked: false,
  extraSeconds: 0,
  accommodations: null,
  client: null,
});

export const studentRow = (view: TeacherView, studentId: string, questionCount: number): LiveStudent =>
  view.rows[studentId] ?? placeholderStudent(studentId, questionCount);

// Everything the view knows about one attempt, for the panel that shows it.
export type AttemptWatch = {
  readonly values: Readonly<Record<string, AnswerValue>> | undefined;
  readonly justChanged: string | undefined;
  readonly pulse: number;
  readonly waiting: boolean;
};

export const attemptWatch = (view: TeacherView, attemptId: string | null): AttemptWatch => ({
  values: attemptId ? view.values[attemptId] : undefined,
  justChanged: attemptId ? view.changed[attemptId] : undefined,
  pulse: attemptId ? (view.pulses[attemptId] ?? 0) : 0,
  waiting: isWaiting(view, attemptId),
});
