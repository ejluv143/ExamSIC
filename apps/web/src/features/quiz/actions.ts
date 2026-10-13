"use server";

import { redirect } from "next/navigation";
import type { Paper } from "@examinus/contract/attempt";
import { assetIdsIn } from "@examinus/domain/asset";
import { defaultIntegrity } from "@examinus/domain/integrity";
import { toStudentQuestion } from "@examinus/domain/question";
import { requirePermission, requireTeacher } from "@/lib/auth/dal";
import { assetUrls } from "@/features/assets/data";
import { duplicateQuiz, removeQuiz, saveQuiz } from "@/features/quiz/data";
import { schoolPaper, schoolProfile } from "@/lib/school";
import { emptyPart, quizPaperTotals, roman, toDraft, type EditorQuiz } from "@/features/quiz/quiz-editor";
import type { SubjectArea } from "@examinus/domain/roles";
import { refresh } from "@/lib/refresh";

// Creates a quiz from the "New quiz" dialog (title, subject, description and the names of its parts) and opens
// its editor. Blank part names become "Part I", "Part II"…, or "Questions" when there is only one part.
export async function createQuizAction(input: {
  title: string;
  description: string;
  subject?: string;
  subjectArea: SubjectArea;
  parts: string[];
}) {
  const user = await requireTeacher();
  const names = input.parts.length > 0 ? input.parts : [""];
  const quiz: EditorQuiz = {
    id: "new",
    title: input.title.trim(),
    description: input.description,
    ...(input.subject ? { subject: input.subject } : {}),
    subjectArea: input.subjectArea,
    header: { ...schoolProfile, period: null, dates: "" },
    paper: { ...structuredClone(schoolPaper), instructor: user.name },
    parts: names.map((name, i) => emptyPart(name.trim() || (names.length === 1 ? "Questions" : `Part ${roman(i + 1)}`))),
    settings: { shuffleQuestions: false, shuffleChoices: false, shuffleParts: false },
  };
  if (!quiz.title) return { error: "Give the quiz a title." };
  // A quiz with no questions yet can't pass the editor's check, but the API accepts it as a draft.
  const result = await saveQuiz(quiz);
  if ("error" in result) return result;
  refresh();
  redirect(`/teacher/assessments/${result.ok.quizId}/edit`);
}

// Saves a quiz from the editor.
export async function saveQuizAction(quiz: EditorQuiz) {
  const result = await saveQuiz(quiz);
  if ("error" in result) return result;
  refresh();
  return { ok: result.ok };
}

export async function duplicateQuizAction(quizId: string) {
  const result = await duplicateQuiz(quizId);
  if ("error" in result) return result;
  refresh();
  redirect(`/teacher/assessments/${result.ok.quizId}`);
}

export async function removeQuizAction(quizId: string) {
  const result = await removeQuiz(quizId);
  if ("error" in result) return result;
  refresh();
  redirect("/teacher/assessments");
}

// The editor's online preview: the paper as a student gets it (no answers, no shuffling), built from the
// unsaved draft. The session around it is a stand-in and is never stored.
export async function previewPaperAction(quiz: EditorQuiz): Promise<Paper> {
  await requirePermission({ assessment: ["read"] });
  const draft = toDraft(quiz);
  return {
    session: {
      id: "preview",
      quizId: quiz.id,
      classId: null,
      mode: "quiz",
      pacing: "student",
      status: "running",
      opensAt: null,
      closesAt: null,
      timeLimitMinutes: null,
      oneQuestionAtATime: false,
      questionTimeLimitSeconds: null,
      navigation: "free",
      maxMarked: null,
      lateJoinMinutes: null,
      roomPasswordRequired: false,
      ipRestricted: false,
      allowGuests: false,
      attemptsAllowed: 1,
      resultsRelease: "immediately",
      resultsReleased: false,
      integrity: defaultIntegrity("quiz"),
      mastery: null,
      exam: null,
      game: null,
      countInRecord: false,
      joinCode: null,
      startedAt: null,
      endedAt: null,
      pausedAt: null,
    },
    quiz: {
      id: quiz.id,
      title: draft.title,
      description: draft.description,
      subject: draft.subject,
      subjectArea: draft.subjectArea,
      header: draft.header,
    },
    parts: draft.parts.map((part, position) => ({
      id: part.id,
      quizId: quiz.id,
      position,
      title: part.title,
      instructions: part.instructions,
      shuffleQuestions: false,
      poolSize: null,
      questions: part.questions.map((q) => toStudentQuestion(q)),
    })),
    attempt: null,
    attemptsUsed: 0,
    ...quizPaperTotals(quiz),
    progress: null,
    review: [],
    answers: {},
    assetUrls: await assetUrls(assetIdsIn(JSON.stringify([draft.description, draft.parts]))),
    typing: {},
    deadline: null,
    codeRunner: false,
    paused: false,
    locked: false,
  };
}
