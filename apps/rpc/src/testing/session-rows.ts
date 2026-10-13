// Row and paper fixtures for the attempt and session service tests: a quiz with one multiple choice and one essay
// question, a session and an attempt, each with sensible defaults and the fields a test cares about overridden.
import type { QuizDetail } from "@examinus/contract/quiz";
import type { SessionSettingsFields } from "@examinus/contract/session";
import type { Question } from "@examinus/domain/question";
import type { ExamSettings, IntegritySettings } from "@examinus/domain/quiz";
import type { AnswerItem, AttemptItem, QuestionItem, QuizItem, QuizSessionItem } from "../database/schemas/index.ts";

export const t0 = new Date("2026-03-02T08:00:00.000Z");

export const integrity: IntegritySettings = {
  requireFullscreen: false,
  trackFocus: false,
  blockSecondScreen: false,
  blockRightClick: false,
  blockCopy: false,
  blockPaste: false,
  blockPrint: false,
  clearClipboardOnStart: false,
  allowPasteInCode: false,
  watermark: false,
  autoSubmitAfter: null,
};

export const quizItem = (over: Partial<QuizItem> = {}): QuizItem => ({
  id: "quiz1",
  ownerId: "teacher1",
  title: "Quiz One",
  description: "",
  subject: null,
  subjectArea: null,
  header: {
    schoolLogoUrl: null,
    departmentLogoUrl: null,
    school: "School",
    schoolAddress: "",
    department: "",
    semester: "first",
    academicYear: "2026-2027",
    period: null,
    dates: "",
  },
  paper: {
    size: "a4",
    answerSheet: false,
    instructor: "",
    generalInstructions: [],
    footer: { documentNo: "", effectivityDate: "", revisionNo: "", member: "", motto: "" },
  },
  settings: { shuffleQuestions: false, shuffleChoices: false, shuffleParts: false },
  createdAt: t0,
  updatedAt: t0,
  ...over,
});

// Worth 2 points; the right choice is "b".
export const choiceQuestion = (id = "q1"): Question => ({
  id,
  prompt: "Pick one",
  points: 2,
  gamePoints: "standard",
  partialCredit: false,
  type: "multiple_choice",
  choices: [
    { id: "a", text: "A" },
    { id: "b", text: "B" },
  ],
  correctChoiceIds: ["b"],
  multipleCorrect: false,
});

// Worth 5 points; only a teacher can score it.
export const essayQuestion = (id = "q2"): Question => ({
  id,
  prompt: "Explain",
  points: 5,
  gamePoints: "standard",
  partialCredit: false,
  type: "essay",
  rubric: [],
});

export const quizDetail = (questions: Question[] = [choiceQuestion(), essayQuestion()], quiz: QuizItem = quizItem()): QuizDetail => ({
  quiz: {
    ...quiz,
    createdAt: quiz.createdAt.toISOString(),
    updatedAt: quiz.updatedAt.toISOString(),
  },
  parts: [
    {
      id: "part1",
      quizId: quiz.id,
      position: 0,
      title: "Part 1",
      instructions: "",
      shuffleQuestions: false,
      poolSize: null,
      questions,
    },
  ],
});

// A quiz session that is running (stored status "running"), open to everyone, with no limits.
export const sessionItem = (over: Partial<QuizSessionItem> = {}): QuizSessionItem => ({
  id: "sess1",
  quizId: "quiz1",
  classId: "class1",
  mode: "quiz",
  pacing: "student",
  status: "running",
  opensAt: null,
  closesAt: null,
  timeLimitMinutes: null,
  attemptsAllowed: 1,
  resultsRelease: "immediately",
  resultsReleased: false,
  integrity,
  mastery: null,
  exam: null,
  countInRecord: true,
  joinCode: "ABCD234",
  startedAt: t0,
  endedAt: null,
  oneQuestionAtATime: false,
  questionTimeLimitSeconds: null,
  navigation: "free",
  maxMarked: null,
  lateJoinMinutes: null,
  roomPassword: null,
  ipAllowlist: [],
  allowGuests: false,
  pausedAt: null,
  gameQuestionSeconds: 20,
  gameLeaderboard: true,
  gameStreakBonus: true,
  gamePhase: null,
  currentQuestionIndex: null,
  questionStartedAt: null,
  relay: null,
  relayPassword: null,
  relayClues: [],
  createdAt: t0,
  updatedAt: t0,
  ...over,
});

export const attemptItem = (over: Partial<AttemptItem> = {}): AttemptItem => ({
  id: "att1",
  sessionId: "sess1",
  studentId: "student1",
  attemptNumber: 1,
  seed: 1,
  status: "in_progress",
  startedAt: new Date(),
  submittedAt: null,
  deviceId: "dev1",
  ip: null,
  lastSeenAt: new Date(),
  questionIndex: 0,
  furthestIndex: 0,
  questionStartedAt: null,
  extraMs: 0,
  locked: false,
  pledgeAcceptedAt: null,
  points: 0,
  gameStreak: 0,
  masteryQueue: null,
  coachReport: null,
  createdAt: t0,
  updatedAt: t0,
  ...over,
});

export const answerItem = (attemptId: string, questionId: string, over: Partial<AnswerItem> = {}): AnswerItem => ({
  id: `${attemptId}-${questionId}`,
  attemptId,
  questionId,
  value: null,
  correct: null,
  autoScore: null,
  manualScore: null,
  feedback: null,
  answeredAt: t0,
  timeSpentMs: null,
  markedForReview: false,
  shownMs: 0,
  gamePointsEarned: null,
  timeMs: null,
  tries: 0,
  triesLog: null,
  aiSuggestion: null,
  createdAt: t0,
  updatedAt: t0,
  ...over,
});

export const exam: ExamSettings = { computersOnly: true, honorPledge: "I will not cheat.", deviceGraceMinutes: 5 };

// A multiple choice question as stored (a row of `questions`), worth `points`.
export const questionRow = (id: string, points: number): QuestionItem => ({
  id,
  partId: "part1",
  position: 0,
  type: "multiple_choice",
  prompt: "Pick one",
  topic: null,
  points,
  gamePoints: "standard",
  partialCredit: false,
  body: {
    type: "multiple_choice",
    choices: [
      { id: "a", text: "A" },
      { id: "b", text: "B" },
    ],
    correctChoiceIds: ["b"],
    multipleCorrect: false,
  },
  createdAt: t0,
  updatedAt: t0,
});

// What a teacher sends to create or change a quiz session: no limits, results at once.
export const sessionSettings = (over: Partial<SessionSettingsFields> = {}): SessionSettingsFields => ({
  mode: "quiz",
  opensAt: null,
  closesAt: null,
  timeLimitMinutes: null,
  attemptsAllowed: 1,
  resultsRelease: "immediately",
  integrity,
  mastery: null,
  exam: null,
  game: null,
  pacing: "student",
  countInRecord: true,
  oneQuestionAtATime: false,
  questionTimeLimitSeconds: null,
  navigation: "free",
  maxMarked: null,
  lateJoinMinutes: null,
  roomPassword: null,
  ipAllowlist: [],
  allowGuests: false,
  relayPassword: null,
  relayClues: [],
  ...over,
});
