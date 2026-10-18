// Raw question drafts (the JSON the AI helper's kinds define, see `question_shapes`) into questions. Each kind's
// `draft.decode` decides what holds up; `draftQuestion` (domain) builds the base fields and validates the result.
import { AiDraft, draftQuestion } from "@examinus/domain/ai";
import { questionKinds } from "@examinus/domain/kinds";
import { questionTypes, type Question, type QuestionType } from "@examinus/domain/question";
import { Schema } from "effect";

export type Rejected = { index: number; reason: string };

const decodeDraft = Schema.decodeUnknownResult(AiDraft);

export const creatableTypes = questionTypes.filter((t) => questionKinds[t].draft !== undefined);

const newId = () => `q${crypto.randomUUID().slice(0, 8)}`;

// Questions for the drafts that decode, and the reason for each one that doesn't. `points` in a draft defaults to 1.
export function decodeDrafts(raws: readonly unknown[]): { questions: Question[]; rejected: Rejected[] } {
  const questions: Question[] = [];
  const rejected: Rejected[] = [];
  raws.forEach((raw, index) => {
    const reject = (reason: string) => rejected.push({ index, reason });
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return reject("A draft must be a JSON object.");
    const decoded = decodeDraft(raw);
    if (decoded._tag === "Failure") return reject(String(decoded.failure.message ?? decoded.failure).replace(/\s+/g, " ").trim());
    const kind = Object.hasOwn(questionKinds, decoded.success.type) ? questionKinds[decoded.success.type as QuestionType] : undefined;
    if (!kind?.draft) return reject(`Type "${decoded.success.type}" can't be created here. Creatable types: ${creatableTypes.join(", ")}.`);
    const points = "points" in raw ? (raw.points ?? 1) : 1;
    if (typeof points !== "number" || !Number.isFinite(points) || points < 0 || points % 0.5 !== 0) return reject("points must be a whole or half number, 0 or more.");
    const question = draftQuestion(decoded.success, points, newId);
    if (question === null) return reject(`The ${decoded.success.type} draft doesn't hold up (empty prompt or wrong fields). Expected shape: ${kind.draft.shape}`);
    questions.push(question);
  });
  return { questions, rejected };
}
