// Builds the database rows for the demo quizzes and submissions in seed-data/demo-quizzes.json, a copy of the
// web app's mock assessments (apps/web/src/lib/data/mock.ts). Ids are stable, so seeding twice changes nothing.
import {
  autoScore,
  examLockedSettings,
  Question,
  type AnswerValue,
  type CodeResults,
  type IntegrityEvent,
  newJoinKey,
  type IntegritySettings,
  type PaperHeader,
  type PaperSettings,
  type QuestionType,
  type SubjectArea,
  type TypingEdits,
} from "@examora/contract";
import { Schema } from "effect";
import { readFileSync } from "node:fs";
import { examColumn } from "../modes/exam.ts";
import type {
  NewAnswer,
  NewAttempt,
  NewBankQuestion,
  NewIntegrityEvent,
  NewQuestion,
  NewQuiz,
  NewQuizPart,
  NewQuizSession,
} from "./schemas/index.ts";

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

export type DemoStudent = { id: string; studentNumber: string; firstName: string; lastName: string; email: string };

type DemoData = {
  students: DemoStudent[];
  classes: { id: string; courseCode: string; studentIds: string[] }[];
  assessments: DemoAssessment[];
  submissions: DemoSubmission[];
};

const bankData: unknown[] = JSON.parse(readFileSync(new URL("./seed-data/question-bank.json", import.meta.url), "utf8"));

const data: DemoData = JSON.parse(readFileSync(new URL("./seed-data/demo-quizzes.json", import.meta.url), "utf8"));

export const demoStudents = data.students;

// The teacher who owns the demo quizzes (Prof. Reyes, see seed.ts).
const ownerId = "t1";

// The demo quizzes had one part per kind of question, in this order. A part's kind is the question type; blank
// questions (identification, fill in the blank and cloze) share one part.
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
    title: "Identification / Fill in the Blank",
    instructions:
      "Identify the term, concept, or formula described in each item, or fill in each blank with the correct word or phrase. Write your answer on the space provided.",
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

const sessionStatus = { draft: undefined, scheduled: "scheduled", open: "running", closed: "ended" } as const;
const date = (iso: string | null) => (iso ? new Date(iso) : null);

export const userIdOf = (rosterId: string) => `u-${rosterId}`;
export const demoQuestionId = (assessmentId: string, questionId: string) => `${assessmentId}-${questionId}`;

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
    const classCode = data.classes.find((c) => c.id === a.classIds[0])?.courseCode;
    quizzes.push({
      id: a.id,
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
      classId: a.classIds[0] ?? null,
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
    const studentIds = new Set(a.classIds.flatMap((id) => data.classes.find((c) => c.id === id)?.studentIds ?? []));
    for (const studentId of studentIds) sessionStudents.push({ sessionId, studentId: userIdOf(studentId) });
  }

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

// The shared question bank (owner null), from the web app's mock `questionBank`.
export function buildBank(): NewBankQuestion[] {
  return bankData.map((raw) => {
    const question = Schema.decodeUnknownSync(Question)(raw);
    return { id: `bank-${question.id}`, ownerId: null, question, topic: question.topic ?? null };
  });
}
