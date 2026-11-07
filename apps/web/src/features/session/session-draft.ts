// The session form's settings while the teacher edits them: what a new session starts with for each mode, what an
// existing one is seeded from, the one-click starters, the checks and the payload to save. Pure, so the rules live
// here and the form only renders. All schedules are Manila time.
import { clientKinds, type ClientKind } from "@examinus/domain/client";
import {
  defaultHonorPledge,
  examDefaults,
  examLockedSettings,
} from "@examinus/domain/exam";
import { defaultIntegrity } from "@examinus/domain/integrity";
import { isFrozen } from "@examinus/domain/freeze";
import {
  deviceGraceLimits,
  guestModes,
  honorPledgeMaxLength,
  type IntegritySettings,
  type ResultsRelease,
  type Session,
  type SessionMode,
  type SessionNavigation,
} from "@examinus/domain/quiz";
import { defaultMaxMarked, defaultNavigation } from "@examinus/domain/review";
import { gameDraft, gameFromDraft, type GameDraft } from "@/features/game/game-draft";
import { masteryDraft, masteryFromDraft, type MasteryDraft } from "@/features/mastery/mastery-draft";
import { fromLocalInput, toLocalInput } from "@examinus/copy/time";
import type { SessionSecrets } from "./actions";
import type { SessionInput } from "./data";

// --- Manila wall time ---

// Manila wall time `days` from `now`, at `time` ("HH:MM") when given, as a datetime-local value.
export function manilaAt(days: number, time?: string, now = Date.now()): string {
  const local = toLocalInput(new Date(now + days * 86_400_000).toISOString());
  return time ? `${local.slice(0, 10)}T${time}` : local;
}

// --- The draft ---

export type AttemptsChip = "1" | "2" | "3" | "unlimited" | "custom";
export type MarkedChip = "0" | "1" | "3" | "5" | "unlimited" | "custom";
export type StartWhen = "now" | "schedule" | "manual";

export type SessionDraft = {
  classId: string;
  mode: SessionMode;
  startWhen: StartWhen;
  // datetime-local values.
  opens: string;
  closes: string;
  timeLimit: string;
  attempts: AttemptsChip;
  customAttempts: string;
  release: ResultsRelease;
  integrity: IntegritySettings;
  oneAtATime: boolean;
  // Kept while one question at a time is off (a paper on one page is always free), so turning it on restores it.
  navigation: SessionNavigation;
  marked: MarkedChip;
  customMarked: string;
  questionSeconds: string;
  lateJoin: string;
  password: string;
  // Examinus Desktop: the password that lets a student close the app during an attempt.
  exitPassword: string;
  lockExit: boolean;
  computersOnly: boolean;
  allowMobile: boolean;
  pledge: string;
  graceMinutes: string;
  allowlist: string;
  limitNetworks: boolean;
  mastery: MasteryDraft;
  game: GameDraft;
  countInRecord: boolean;
  allowGuests: boolean;
};

export const chipOfAttempts = (n: number | null): AttemptsChip =>
  n === null ? "unlimited" : n === 1 || n === 2 || n === 3 ? (String(n) as AttemptsChip) : "custom";

export const chipOfMarked = (n: number | null): MarkedChip =>
  n === null ? "unlimited" : n === 0 || n === 1 || n === 3 || n === 5 ? (String(n) as MarkedChip) : "custom";

// Six readable characters: no 0/O or 1/I/L.
export function generatePassword(): string {
  const letters = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => letters[b % letters.length]).join("");
}

// What a new session starts with for each mode; the teacher can change everything except an exam's locked settings.
function modePreset(mode: SessionMode, newPassword: () => string) {
  const exam = mode === "exam";
  return {
    timeLimit: exam ? "60" : "",
    attempts: chipOfAttempts(1),
    release: (exam ? examDefaults.resultsRelease : "immediately") as ResultsRelease,
    integrity: defaultIntegrity(mode),
    lateJoin: exam ? String(examDefaults.lateJoinMinutes) : "",
    password: exam ? newPassword() : "",
    navigation: defaultNavigation(mode),
    marked: chipOfMarked(defaultMaxMarked(mode)),
  };
}

// A new session. No class unless one was asked for: anyone with the key may join.
export function newDraft(input: { defaultClassId?: string } = {}, newPassword = generatePassword): SessionDraft {
  return {
    classId: input.defaultClassId ?? "",
    mode: "quiz",
    startWhen: "now",
    opens: "",
    closes: "",
    ...modePreset("quiz", newPassword),
    customAttempts: "4",
    customMarked: "10",
    oneAtATime: false,
    questionSeconds: "",
    exitPassword: "",
    lockExit: false,
    computersOnly: examDefaults.computersOnly,
    allowMobile: false,
    pledge: defaultHonorPledge,
    graceMinutes: String(examDefaults.deviceGraceMinutes),
    allowlist: "",
    limitNetworks: false,
    mastery: masteryDraft(null),
    game: gameDraft(null, undefined),
    countInRecord: true,
    allowGuests: false,
  };
}

// An existing session and the draft it was seeded as. The seed is what the locked fields go back to.
export type Origin = { session: Session; seed: SessionDraft };

export function originOf(session: Session, secrets: Partial<SessionSecrets> = {}): Origin {
  const allowlist = secrets.ipAllowlist ?? [];
  const attempts = chipOfAttempts(session.attemptsAllowed);
  const marked = chipOfMarked(session.maxMarked);
  return {
    session,
    seed: {
      classId: session.classId ?? "",
      mode: session.mode,
      startWhen: session.opensAt ? "schedule" : "manual",
      opens: toLocalInput(session.opensAt),
      closes: toLocalInput(session.closesAt),
      timeLimit: session.timeLimitMinutes === null ? "" : String(session.timeLimitMinutes),
      attempts,
      customAttempts: attempts === "custom" ? String(session.attemptsAllowed) : "4",
      release: session.resultsRelease,
      integrity: session.integrity,
      oneAtATime: session.oneQuestionAtATime,
      navigation: session.oneQuestionAtATime ? session.navigation : defaultNavigation(session.mode),
      marked,
      customMarked: marked === "custom" ? String(session.maxMarked) : "10",
      questionSeconds: session.questionTimeLimitSeconds ? String(session.questionTimeLimitSeconds) : "",
      lateJoin: session.lateJoinMinutes === null ? "" : String(session.lateJoinMinutes),
      password: secrets.roomPassword ?? "",
      exitPassword: secrets.exitPassword ?? "",
      lockExit: (secrets.exitPassword ?? "") !== "",
      computersOnly: session.exam?.computersOnly ?? examDefaults.computersOnly,
      allowMobile: session.exam?.allowMobile ?? false,
      pledge: session.exam?.honorPledge ?? defaultHonorPledge,
      graceMinutes: String(session.exam?.deviceGraceMinutes ?? examDefaults.deviceGraceMinutes),
      allowlist: allowlist.join("\n"),
      limitNetworks: allowlist.length > 0,
      mastery: masteryDraft(session.mastery),
      game: gameDraft(session.game, session.pacing, {
        relayPassword: secrets.relayPassword ?? null,
        relayClues: secrets.relayClues ?? [],
      }),
      countInRecord: session.countInRecord,
      allowGuests: session.allowGuests,
    },
  };
}

// --- Changing the draft ---

// Picking a mode on a new session also applies that mode's usual settings; an existing session only changes mode.
export function changeMode(draft: SessionDraft, mode: SessionMode, origin?: Origin, newPassword = generatePassword): SessionDraft {
  if (origin) return { ...draft, mode };
  const { timeLimit, attempts, release, integrity, lateJoin, password, navigation, marked } = modePreset(mode, newPassword);
  return { ...draft, mode, timeLimit, attempts, release, integrity, lateJoin, password, navigation, marked };
}

export function changeOneAtATime(draft: SessionDraft, on: boolean): SessionDraft {
  return { ...draft, oneAtATime: on, questionSeconds: on ? draft.questionSeconds : "" };
}

// Choosing "later" without a time suggests tomorrow morning.
export function changeStartWhen(draft: SessionDraft, startWhen: StartWhen, now = Date.now()): SessionDraft {
  return { ...draft, startWhen, opens: startWhen === "schedule" && !draft.opens ? manilaAt(1, "09:00", now) : draft.opens };
}

// Turning the exit password on makes one when there is none.
export function changeLockExit(draft: SessionDraft, on: boolean, newPassword = generatePassword): SessionDraft {
  return { ...draft, lockExit: on, exitPassword: on && !draft.exitPassword.trim() ? newPassword() : draft.exitPassword };
}

// All clients allowed (the default) is stored as no list at all.
export function changeAllowedClients(draft: SessionDraft, allowedClients: ClientKind[]): SessionDraft {
  const { allowedClients: _previous, ...rest } = draft.integrity;
  return { ...draft, integrity: allowedClients.length === clientKinds.length ? rest : { ...rest, allowedClients } };
}

export type StarterId = "pop" | "homework" | "exam" | "practice" | "game";

// One-click starting points for a new session: each picks the type (with its usual settings) and then the few values
// that make it what it says. Everything stays editable.
const starterSpecs: Record<
  StarterId,
  {
    mode: SessionMode;
    values: (now: number) => { startWhen: StartWhen; opens?: string; closes?: string; attempts?: AttemptsChip; release?: ResultsRelease };
  }
> = {
  pop: { mode: "quiz", values: () => ({ startWhen: "now", attempts: "1", release: "immediately" }) },
  homework: {
    mode: "quiz",
    values: (now) => ({ startWhen: "now", closes: manilaAt(7, "23:59", now), attempts: "2", release: "after_close" }),
  },
  exam: {
    mode: "exam",
    values: (now) => ({ startWhen: "schedule", opens: manilaAt(1, "09:00", now), closes: manilaAt(1, "11:00", now) }),
  },
  practice: { mode: "mastery", values: () => ({ startWhen: "now" }) },
  game: { mode: "game", values: () => ({ startWhen: "now" }) },
};

export const starterMode = (id: StarterId): SessionMode => starterSpecs[id].mode;

export function applyStarter(draft: SessionDraft, id: StarterId, now = Date.now(), newPassword = generatePassword): SessionDraft {
  const spec = starterSpecs[id];
  const v = spec.values(now);
  return {
    ...changeMode(draft, spec.mode, undefined, newPassword),
    startWhen: v.startWhen,
    opens: v.opens ?? "",
    closes: v.closes ?? "",
    ...(v.attempts ? { attempts: v.attempts } : {}),
    ...(v.release ? { release: v.release } : {}),
  };
}

// --- What an opened or running session keeps ---

// An opened session (lobby or running) keeps its type, class and opening time (and a game its pace); a scheduled one
// can still change them. Once it started, students are taking it under its rules, so those stay too. When each
// happens is the domain freeze table, so the API and this form agree.
export function locksOf(session: Session | undefined): { opened: boolean; started: boolean } {
  if (!session) return { opened: false, started: false };
  return { opened: isFrozen("opensAt", session.status), started: isFrozen("integrity", session.status) };
}

// The draft with its locked fields put back to what the session was seeded with.
function locked(draft: SessionDraft, origin: Origin | undefined): SessionDraft {
  if (!origin) return draft;
  const { opened, started } = locksOf(origin.session);
  const seed = origin.seed;
  let next = draft;
  if (opened) {
    next = { ...next, mode: seed.mode, classId: seed.classId, startWhen: seed.startWhen, opens: seed.opens, game: { ...next.game, pacing: seed.game.pacing } };
  }
  if (started) {
    next = {
      ...next,
      integrity: seed.integrity,
      allowlist: seed.allowlist,
      limitNetworks: seed.limitNetworks,
      exitPassword: seed.exitPassword,
      lockExit: seed.lockExit,
      oneAtATime: seed.oneAtATime,
      questionSeconds: seed.questionSeconds,
      navigation: seed.navigation,
      marked: seed.marked,
      customMarked: seed.customMarked,
    };
    // A game's own rules (clock, leaderboard) stay editable.
    if (next.mode !== "game") {
      next = {
        ...next,
        computersOnly: seed.computersOnly,
        allowMobile: seed.allowMobile,
        pledge: seed.pledge,
        graceMinutes: seed.graceMinutes,
        mastery: seed.mastery,
      };
    }
  }
  return next;
}

// --- Reading the draft ---

export const attemptsAllowedOf = (d: SessionDraft): number | null =>
  d.attempts === "unlimited" ? null : d.attempts === "custom" ? Number(d.customAttempts) : Number(d.attempts);

export const maxMarkedOf = (d: SessionDraft): number | null =>
  d.marked === "unlimited" ? null : d.marked === "custom" ? Number(d.customMarked) : Number(d.marked);

// Only papers with questions to go between have navigation and marks: not games, not mastery's retry queue.
export const hasNavigation = (mode: SessionMode): boolean => mode === "quiz" || mode === "exam";

// --- Checking and saving ---

// Each problem belongs to the area of the form that fixes it.
export type Area = "basics" | "rules" | "access" | "results" | "security";
export type Problem = { area: Area; text: string };

const maxMarkedLimit = 500;
const minQuestionSeconds = 5;

const intIn = (n: number, min: number, max = Infinity) => Number.isInteger(n) && n >= min && n <= max;

// Everything the checks work out, and that the payload is made of.
function resolve(input: SessionDraft, origin: Origin | undefined) {
  const d = locked(input, origin);
  const { opened } = locksOf(origin?.session);
  const exam = d.mode === "exam";
  const opensAt = opened ? (origin?.session.opensAt ?? null) : d.startWhen === "schedule" ? fromLocalInput(d.opens) : null;
  const closesAt = fromLocalInput(d.closes);
  const late = d.lateJoin ? Number(d.lateJoin) : null;
  const seconds = d.questionSeconds ? Number(d.questionSeconds) : null;
  const grace = Number(d.graceMinutes);
  const mastery = d.mode === "mastery" ? masteryFromDraft(d.mastery) : null;
  const game = d.mode === "game" ? gameFromDraft(d.game) : null;
  const addresses = d.limitNetworks
    ? d.allowlist
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
    : [];
  return {
    d,
    opened,
    exam,
    opensAt,
    closesAt,
    late,
    seconds,
    grace,
    mastery,
    game,
    addresses,
    attemptsAllowed: attemptsAllowedOf(d),
    maxMarked: maxMarkedOf(d),
    navigable: hasNavigation(d.mode),
  };
}

// Everything wrong with the draft, each with the area that fixes it.
export function validate(draft: SessionDraft, origin?: Origin): Problem[] {
  const r = resolve(draft, origin);
  const { d } = r;
  const found: Problem[] = [];
  const add = (area: Area, text: string) => found.push({ area, text });
  if (!r.opened && d.startWhen === "schedule" && !r.opensAt) add("basics", "Set an open time, or choose to start now.");
  if (r.exam && !r.closesAt) add("basics", "Exams need a close time.");
  if (r.opensAt && r.closesAt && r.closesAt <= r.opensAt) add("basics", "Close time must be after open time.");
  if (d.attempts === "custom" && (r.attemptsAllowed === null || !intIn(r.attemptsAllowed, 1)))
    add("basics", "Attempts must be a whole number, 1 or more.");
  if (r.late !== null && !intIn(r.late, 1)) add("access", "Late-join cutoff must be a whole number of minutes, 1 or more.");
  // Pacing sits with the navigation for quizzes and exams, and with anti-cheating for the other types.
  const pacingArea: Area = r.navigable ? "rules" : "security";
  if (r.navigable && d.marked === "custom" && (r.maxMarked === null || !intIn(r.maxMarked, 1, maxMarkedLimit)))
    add("rules", `The number of questions students may mark for review must be a whole number from 1 to ${maxMarkedLimit}.`);
  if (d.oneAtATime && r.seconds !== null && !intIn(r.seconds, minQuestionSeconds))
    add(pacingArea, `Time per question must be a whole number of at least ${minQuestionSeconds} seconds.`);
  if (r.exam && !intIn(r.grace, deviceGraceLimits.minimum, deviceGraceLimits.maximum))
    add("rules", `The device grace period must be ${deviceGraceLimits.minimum} to ${deviceGraceLimits.maximum} minutes.`);
  if (r.exam && d.pledge.trim() === "") add("rules", "Write the honor pledge students accept.");
  if (r.exam && d.pledge.trim().length > honorPledgeMaxLength) add("rules", `The honor pledge can be at most ${honorPledgeMaxLength} characters.`);
  if (r.mastery && "problems" in r.mastery) r.mastery.problems.forEach((text) => add("rules", text));
  if (r.game && "problems" in r.game) r.game.problems.forEach((text) => add("rules", text));
  const badAddress = r.addresses.find((a) => !/^[0-9a-fA-F.:]+(\/\d{1,3})?$/.test(a));
  if (badAddress) add("security", `"${badAddress}" is not an IP address or range such as 10.0.4.0/24.`);
  if (d.integrity.allowedClients !== undefined && d.integrity.allowedClients.length === 0)
    add("security", "Allow at least one of the web browser, the desktop app and the mobile app.");
  return found;
}

// The first area with a problem, in the order the form shows them.
export function firstProblemArea(problems: readonly Problem[]): Area | null {
  return (["basics", "rules", "access", "results", "security"] as const).find((a) => problems.some((p) => p.area === a)) ?? null;
}

// The payload to save a draft that has no problems.
export function toInput(draft: SessionDraft, origin?: Origin): SessionInput {
  const r = resolve(draft, origin);
  const { d } = r;
  const mastery = r.mastery && "settings" in r.mastery ? r.mastery.settings : null;
  const game = r.game && "settings" in r.game ? r.game : null;
  return {
    classId: d.classId || null,
    mode: d.mode,
    exam: r.exam ? { computersOnly: d.computersOnly, honorPledge: d.pledge.trim(), deviceGraceMinutes: r.grace, allowMobile: d.allowMobile } : null,
    opensAt: r.opensAt,
    closesAt: r.closesAt,
    timeLimitMinutes: d.timeLimit ? Math.max(1, Math.floor(Number(d.timeLimit))) : null,
    attemptsAllowed: r.attemptsAllowed,
    resultsRelease: d.release,
    mastery,
    game: game?.settings ?? null,
    pacing: d.mode === "game" ? d.game.pacing : "student",
    relayPassword: game?.relayPassword ?? null,
    relayClues: game?.relayClues ?? [],
    // An exam always has its locked rules on; teachers may only add stricter ones.
    integrity: r.exam
      ? { ...d.integrity, ...Object.fromEntries(examLockedSettings.map(([key]) => [key, true])) }
      : d.integrity.blockPaste
        ? d.integrity
        : { ...d.integrity, allowPasteInCode: false },
    oneQuestionAtATime: d.oneAtATime,
    questionTimeLimitSeconds: d.oneAtATime ? r.seconds : null,
    navigation: r.navigable && d.oneAtATime ? d.navigation : "free",
    maxMarked: r.navigable ? r.maxMarked : 0,
    lateJoinMinutes: r.late,
    roomPassword: d.password.trim() || null,
    exitPassword: d.lockExit ? d.exitPassword.trim() || null : null,
    ipAllowlist: r.addresses,
    // Guests only make sense when anyone with the key may join: games, quizzes and exams without a class.
    allowGuests: !d.classId && guestModes.includes(d.mode) ? d.allowGuests : false,
    // The class record only links sessions of a class.
    countInRecord: d.classId ? d.countInRecord : false,
  };
}
