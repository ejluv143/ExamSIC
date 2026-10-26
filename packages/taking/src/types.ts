import type { CodeTestResult } from "@examinus/domain/kinds/base";
import type { AnswerValue, IntegrityEvent, TypingEdit, TypingEdits } from "@examinus/domain/quiz";

export type Answers = Record<string, AnswerValue>;
export type Typing = Record<string, TypingEdit[]>;

// The Run button for languages the device can't run. `ok` is null when there is no code runner.
export type RunCode = (questionId: string, code: string) => Promise<{ ok: readonly CodeTestResult[] | null } | { error: string }>;

// When a student takes it for real. Every callback returns an error message, or null on success.
// Without this, the component is the teacher's read-only preview.
export type TakeMode = {
  // Records the start on the server (with the room password, when there is one); the page then re-reads the
  // paper, which now has the attempt and questions.
  onStart: (roomPassword: string) => Promise<string | null>;
  // Saves one answer (with the typing history of typed answers, and how long the question was on screen).
  // Rejects when the server can't be reached.
  onSave: (questionId: string, value: AnswerValue, typing?: TypingEdits, timeSpentMs?: number) => Promise<string | null>;
  onEvents: (events: IntegrityEvent[]) => Promise<string | null>;
  // The check-in every ~15 s. Returns the refusal when the attempt can't go on here (another browser or network).
  onHeartbeat: () => Promise<string | null>;
  // One question at a time: opens question `index` (0-based); the page then re-reads the paper. Returns why not.
  onGoTo: (index: number) => Promise<string | null>;
  // One question at a time: re-reads the paper (the server moved on because a question's time ran out).
  onReload: () => void;
  // Marks a question for review, or clears the mark. Returns why not (e.g. the limit is reached).
  onMark: (questionId: string, marked: boolean) => Promise<string | null>;
  // Sends the answers and the events not yet recorded; the page moves on to the result when it works.
  onSubmit: (answers: Answers, events: IntegrityEvent[], typing: Typing) => Promise<string | null>;
  // Student name and number for the watermark.
  watermark: string;
  // Missing when no code runner is set up.
  runCode?: RunCode;
};
