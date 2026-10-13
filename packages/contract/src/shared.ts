// Payload fragments several RPC groups share. Not an entry point of the package (see its `exports`).
import { Schema } from "effect";

export const QuizId = { quizId: Schema.String };
export const ClassId = { classId: Schema.String };
export const SessionId = { sessionId: Schema.String };
export const AttemptId = { attemptId: Schema.String };
