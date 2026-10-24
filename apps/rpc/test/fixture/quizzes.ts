// Builds the database rows for the demo quizzes and submissions in data/demo-quizzes.json. Their sessions are
// for the test teacher's classes (seed-classes.ts). Ids are stable, so seeding twice changes nothing.
import { examLockedSettings } from "@examinus/domain/exam";
import { newJoinKey } from "@examinus/domain/join-key";
import { Question, type QuestionType } from "@examinus/domain/question";
import {
  defaultRelay,
  type AnswerValue,
  type CodeResults,
  type IntegrityEvent,
  type IntegritySettings,
  type PaperHeader,
  type PaperSettings,
  type TypingEdits,
} from "@examinus/domain/quiz";
import { type SubjectArea } from "@examinus/domain/roles";
import { autoScore } from "@examinus/domain/scoring";
import { Schema } from "effect";
import { readFileSync } from "node:fs";
import { examColumn } from "../../src/features/exam/rules.ts";
import { seedClasses, userIdOf } from "./classes.ts";
import type {
  NewAnswer,
  NewAttempt,
  NewBankQuestion,
  NewBankShare,
  NewIntegrityEvent,
  NewQuestion,
  NewQuiz,
  NewQuizPart,
  NewQuizSession,
} from "../../src/database/schemas/index.ts";

type DemoAssessment = {
  id: string;
  kind: "quiz" | "exam";
  title: string;
  subject?: string;
  subjectArea?: SubjectArea;
  header: PaperHeader;
  // Part headings by the old per-type grouping, keyed by the question type of that time.
  paper: PaperSettings & { parts: Partial<Record<string, { title: string; instructions: string }>> };
  description: string;
  classIds: string[];
  status: "draft" | "scheduled" | "open" | "closed";
  resultsReleased: boolean;
  questions: unknown[];
  settings: {
    timeLimitMinutes: number | null;
    opensAt: string | null;
    closesAt: string | null;
    shuffleQuestions: boolean;
    shuffleChoices: boolean;
    attemptsAllowed: number | null;
    resultsRelease: "immediately" | "after_close" | "manual";
    integrity: IntegritySettings;
    countInRecord?: boolean;
  };
  updatedAt: string;
};

type DemoSubmission = {
  id: string;
  assessmentId: string;
  studentId: string;
  startedAt: string;
  submittedAt: string | null;
  status: "in_progress" | "needs_grading" | "graded";
  answers: Record<string, AnswerValue>;
  manualScores: Record<string, number>;
  feedback: Record<string, string>;
  codeResults?: Record<string, CodeResults>;
  typing?: Record<string, TypingEdits>;
  integrityEvents: IntegrityEvent[];
};

type DemoData = {
  assessments: DemoAssessment[];
  submissions: DemoSubmission[];
};

const bankData: unknown[] = JSON.parse(readFileSync(new URL("./data/question-bank.json", import.meta.url), "utf8"));

const data: DemoData = JSON.parse(readFileSync(new URL("./data/demo-quizzes.json", import.meta.url), "utf8"));

// The teacher who owns the demo quizzes and the classes they are for (the test teacher, see seed.ts).
const ownerId = "t-test";
const organizationId = "org-sic";

// The demo quizzes had one part per kind of question, in this order. A part's kind is the question type; blank
// questions (identification) share one part.
type PartKind = Exclude<QuestionType, "blank"> | "fill";
const partKind = (q: Question): PartKind => (q.type === "blank" ? "fill" : q.type);

const partOrder: PartKind[] = [
  "multiple_choice",
  "true_false",
  "fill",
  "enumeration",
  "numeric",
  "essay",
  "sql",
  "code",
];

// The test paper's default part titles and instructions (apps/web/src/components/test-paper.tsx).
const defaultParts: Record<PartKind, { title: string; instructions: string }> = {
  multiple_choice: {
    title: "Multiple Choice",
    instructions: "Read each item carefully and encircle the letter corresponding to the correct answer.",
  },
  true_false: {
    title: "True or False",
    instructions:
      "Write TRUE if the statement is correct and FALSE if it is not. Write your answer on the space provided before each number.",
  },
  fill: {
    title: "Identification",
    instructions:
      "Identify the term, concept, or formula described in each item and write it in the blank. Write your answer on the space provided.",
  },
  matching: { title: "Matching", instructions: "Match each item in Column A with its pair in Column B." },
  enumeration: { title: "Enumeration", instructions: "List what is asked in each item." },
  numeric: {
    title: "Problem Solving",
    instructions: "Solve each problem. Write your final answer on the space provided before each number.",
  },
  essay: { title: "Essay", instructions: "Answer each question briefly but completely." },
  drawing: { title: "Drawing", instructions: "Draw your answer, or photograph your work, for each item." },
  sql: { title: "SQL", instructions: "Write one SELECT query for each problem using the tables given." },
  code: {
    title: "Programming",
    instructions:
      "Write a complete program for each problem. Your program reads the input and prints the output exactly as shown.",
  },
  categorization: { title: "Categorization", instructions: "Write each item under the category it belongs to." },
  ordering: { title: "Re-ordering", instructions: "Write the numbers 1, 2, 3… beside the items to put them in the correct order." },
  hotspot: { title: "Hotspot", instructions: "Mark the correct area on the image for each item." },
};

// Part ids stay as the demo databases already have them; the merged blank part keeps the identification id.
const legacyKey = (kind: PartKind) => (kind === "fill" ? "identification" : kind);

const demoClass = (classId: string | undefined) => seedClasses.find((c) => c.id === classId);

const sessionStatus = { draft: undefined, scheduled: "scheduled", open: "running", closed: "ended" } as const;
const date = (iso: string | null) => (iso ? new Date(iso) : null);

export const demoQuestionId = (assessmentId: string, questionId: string) => `${assessmentId}-${questionId}`;

// One demo Team Relay (a student-paced game on the open demo quiz, which has no essay or drawing questions), with a
// fixed join key so tests and demos can find it. The teacher's password is "teamwork".
export const relayDemoSession = { id: "sess-relay-demo", quizId: "a2", joinCode: "TEAM234", password: "teamwork" } as const;

export function buildDemoQuizzes() {
  const quizzes: NewQuiz[] = [];
  const parts: NewQuizPart[] = [];
  const questions: NewQuestion[] = [];
  const sessions: NewQuizSession[] = [];
  const sessionStudents: { sessionId: string; studentId: string }[] = [];
  const attempts: NewAttempt[] = [];
  const answers: NewAnswer[] = [];
  const integrityEvents: NewIntegrityEvent[] = [];
  const codeResults: { answerId: string; results: CodeResults }[] = [];
  const typingEdits: { answerId: string; edits: TypingEdits }[] = [];

  const sessionIds = new Map<string, string>();
  const questionById = new Map<string, Question>();

  for (const a of data.assessments) {
    const { parts: customParts, ...paper } = a.paper;
    const classCode = demoClass(a.classIds[0])?.courseCode;
    quizzes.push({
      id: a.id,
      organizationId,
      ownerId,
      title: a.title,
      description: a.description,
      subject: a.subject ?? classCode ?? null,
      subjectArea: a.subjectArea ?? null,
      header: a.header,
      paper,
      settings: {
        shuffleQuestions: a.settings.shuffleQuestions,
        shuffleChoices: a.settings.shuffleChoices,
        shuffleParts: false,
      },
      createdAt: new Date(a.updatedAt),
      updatedAt: new Date(a.updatedAt),
    });

    const decoded = a.questions.map((q) => Schema.decodeUnknownSync(Question)(q));
    for (const q of decoded) questionById.set(demoQuestionId(a.id, q.id), q);
    let partPosition = 0;
    for (const type of partOrder) {
      const inPart = decoded.filter((q) => partKind(q) === type);
      if (inPart.length === 0) continue;
      const partId = `${a.id}-part-${legacyKey(type)}`;
      parts.push({
        id: partId,
        quizId: a.id,
        position: partPosition++,
        // Empty custom values fall back to the defaults, as the test paper does.
        title: customParts[legacyKey(type)]?.title.trim() || defaultParts[type].title,
        instructions: customParts[legacyKey(type)]?.instructions.trim() || defaultParts[type].instructions,
        shuffleQuestions: a.settings.shuffleQuestions,
        poolSize: null,
      });
      inPart.forEach(({ id, prompt, points, topic, gamePoints, partialCredit, ...body }, position) => {
        questions.push({
          id: demoQuestionId(a.id, id),
          partId,
          position,
          type: body.type,
          prompt,
          points,
          gamePoints,
          partialCredit,
          topic: topic ?? null,
          body: body as NewQuestion["body"],
        });
      });
    }

    // A draft has no session yet.
    const status = sessionStatus[a.status];
    if (!status) continue;
    const sessionId = `sess-${a.id}`;
    sessionIds.set(a.id, sessionId);
    const { settings } = a;
    sessions.push({
      id: sessionId,
      quizId: a.id,
      classId: demoClass(a.classIds[0])?.id ?? null,
      mode: a.kind,
      exam: examColumn(a.kind, null),
      pacing: "student",
      status,
      opensAt: date(settings.opensAt),
      closesAt: date(settings.closesAt),
      timeLimitMinutes: settings.timeLimitMinutes,
      attemptsAllowed: settings.attemptsAllowed,
      resultsRelease: settings.resultsRelease,
      resultsReleased: a.resultsReleased,
      integrity: a.kind === "exam" ? { ...settings.integrity, ...Object.fromEntries(examLockedSettings.map(([key]) => [key, true])) } : settings.integrity,
      countInRecord: settings.countInRecord ?? true,
      joinCode: newJoinKey(),
      startedAt: status === "scheduled" ? null : date(settings.opensAt),
      endedAt: status === "ended" ? date(settings.closesAt) : null,
    });
    // Each session is for one class: its members are the students allowed in.
    for (const studentId of demoClass(a.classIds[0])?.studentIds ?? [])
      sessionStudents.push({ sessionId, studentId: userIdOf(studentId) });
  }

  const relayQuiz = data.assessments.find((a) => a.id === relayDemoSession.quizId)!;
  const relayClass = demoClass(relayQuiz.classIds[0]);
  sessions.push({
    id: relayDemoSession.id,
    quizId: relayDemoSession.quizId,
    classId: relayClass?.id ?? null,
    mode: "game",
    integrity: relayQuiz.settings.integrity,
    pacing: "student",
    status: "scheduled",
    joinCode: relayDemoSession.joinCode,
    gameQuestionSeconds: 30,
    relay: { ...defaultRelay, teamSize: 3, teamCount: 2, passwordAttempts: 3, roundMinutes: 10, retry: true, rescue: true },
    relayPassword: relayDemoSession.password,
    attemptsAllowed: 1,
    countInRecord: false,
  });
  for (const studentId of relayClass?.studentIds ?? [])
    sessionStudents.push({ sessionId: relayDemoSession.id, studentId: userIdOf(studentId) });

  for (const s of data.submissions) {
    const sessionId = sessionIds.get(s.assessmentId);
    if (!sessionId) throw new Error(`Submission ${s.id} belongs to ${s.assessmentId}, which has no session.`);
    attempts.push({
      id: s.id,
      sessionId,
      studentId: userIdOf(s.studentId),
      attemptNumber: 1,
      // Fixed, so the demo papers shuffle the same way after a re-seed.
      seed: [...s.id].reduce((h, ch) => (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 1, 7),
      status: s.status,
      startedAt: new Date(s.startedAt),
      submittedAt: date(s.submittedAt),
    });

    const questionIds = new Set([
      ...Object.keys(s.answers),
      ...Object.keys(s.manualScores),
      ...Object.keys(s.feedback),
      ...Object.keys(s.codeResults ?? {}),
      ...Object.keys(s.typing ?? {}),
    ]);
    for (const qid of questionIds) {
      const answerId = `${s.id}-${qid}`;
      const questionId = demoQuestionId(s.assessmentId, qid);
      const question = questionById.get(questionId);
      const value = s.answers[qid] ?? null;
      answers.push({
        id: answerId,
        attemptId: s.id,
        questionId,
        value,
        // Graded attempts only; an attempt still in progress has nothing scored yet.
        autoScore: question && s.submittedAt ? autoScore(question, value, s.codeResults?.[qid]) : null,
        manualScore: s.manualScores[qid] ?? null,
        feedback: s.feedback[qid] ?? null,
        answeredAt: new Date(s.submittedAt ?? s.startedAt),
      });
      const results = s.codeResults?.[qid];
      if (results) codeResults.push({ answerId, results });
      const edits = s.typing?.[qid];
      if (edits) typingEdits.push({ answerId, edits });
    }

    s.integrityEvents.forEach((e, n) =>
      integrityEvents.push({
        id: `${s.id}-event-${n}`,
        attemptId: s.id,
        type: e.type,
        at: new Date(e.at),
        durationMs: e.durationMs ?? null,
      }),
    );
  }

  return {
    quizzes,
    parts,
    questions,
    sessions,
    sessionStudents,
    attempts,
    answers,
    integrityEvents,
    codeResults,
    typingEdits,
  };
}

// The shared question bank (owner null), from the web app's mock `questionBank`. Each entry carries the subject and
// subject area the library groups it under next to the question itself.
type BankEntry = { subject: string; subjectArea: SubjectArea };
const bankEntries = bankData.map((raw) => ({
  question: Schema.decodeUnknownSync(Question)(raw),
  subject: (raw as BankEntry).subject,
  subjectArea: (raw as BankEntry).subjectArea,
}));

// Prof. Reyes's own bank questions: his own copies of a few library questions on databases, shared (see
// `demoBankShares`) with the test teacher.
const reyesQuestionIds = ["q1", "q2", "q3"];

export function buildBank(): NewBankQuestion[] {
  const library = bankEntries.map(({ question, subject, subjectArea }) => ({
    id: `bank-${question.id}`,
    organizationId: null,
    ownerId: null,
    question,
    subject,
    subjectArea,
    topic: question.topic ?? null,
  }));
  const reyes = bankEntries
    .filter(({ question }) => reyesQuestionIds.includes(question.id))
    .map(({ question, subject, subjectArea }) => ({
      id: `bank-reyes-${question.id}`,
      organizationId,
      ownerId: "t1",
      question: { ...question, id: `reyes-${question.id}` },
      subject,
      subjectArea,
      topic: question.topic ?? null,
    }));
  return [...library, ...reyes];
}

// One share between two demo teachers: Prof. Reyes shares his "Database Systems" questions (live: new ones count
// too) with the test teacher.
export const demoBankShares: NewBankShare[] = [
  { id: "bshare-reyes-test", organizationId, ownerId: "t1", recipientId: "t-test", scope: "subject", subject: "Database Systems" },
];
