// Pure helpers of the AI feature: key encryption, and reading what the providers reply with.
import { type AiGradeSuggestion } from "@examinus/contract/ai";
import { type AiFeedbackStyle, type AiProvider } from "@examinus/domain/ai";
import { type CoachReport } from "@examinus/domain/analytics";
import { Question, type RubricRow } from "@examinus/domain/question";
import { Schema } from "effect";
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

type Json = Record<string, unknown>;

// --- Encryption of saved keys: AES-256-GCM, the key derived from BETTER_AUTH_SECRET. Stored as base64(iv | tag | ciphertext). ---

const ivBytes = 12;
const tagBytes = 16;

export const deriveKey = (secret: string) => Buffer.from(hkdfSync("sha256", secret, "", "examinus-ai-keys", 32));

export const encryptSecret = (key: Buffer, plain: string): string => {
  const iv = randomBytes(ivBytes);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
};

// null when it can't be decrypted (the secret changed, or the value is damaged).
export const decryptSecret = (key: Buffer, stored: string): string | null => {
  try {
    const data = Buffer.from(stored, "base64");
    if (data.length < ivBytes + tagBytes) return null;
    const decipher = createDecipheriv("aes-256-gcm", key, data.subarray(0, ivBytes));
    decipher.setAuthTag(data.subarray(ivBytes, ivBytes + tagBytes));
    return Buffer.concat([decipher.update(data.subarray(ivBytes + tagBytes)), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
};

const stripFence = (text: string) => text.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");

// The model's reply as a JSON value, or undefined when the reply holds none.
export const extractReply = (provider: AiProvider, body: unknown): unknown => {
  const asObject = (v: unknown): Json | undefined => (typeof v === "object" && v !== null ? (v as Json) : undefined);
  const parse = (text: unknown) => {
    if (typeof text !== "string") return undefined;
    try {
      return JSON.parse(stripFence(text));
    } catch {
      return undefined;
    }
  };
  const root = asObject(body);
  if (!root) return undefined;
  switch (provider) {
    case "openai": {
      const choice = asObject((root.choices as unknown[] | undefined)?.[0]);
      return parse(asObject(choice?.message)?.content);
    }
    case "anthropic": {
      const block = (root.content as unknown[] | undefined)
        ?.map(asObject)
        .find((b) => b?.type === "tool_use");
      return block?.input;
    }
    case "gemini": {
      const candidate = asObject((root.candidates as unknown[] | undefined)?.[0]);
      const parts = asObject(candidate?.content)?.parts as unknown[] | undefined;
      return parse(parts?.map(asObject).find((p) => typeof p?.text === "string")?.text);
    }
  }
};

// What the model returns for one question: a flat shape, whatever the type. The server builds the real question.
const text = Schema.optional(Schema.NullOr(Schema.String));
const RawQuestion = Schema.Struct({
  type: Schema.String,
  prompt: Schema.String,
  explanation: text,
  topic: text,
  choices: Schema.optional(Schema.NullOr(Schema.Array(Schema.Struct({ text: Schema.String, correct: Schema.Boolean })))),
  answer: Schema.optional(Schema.NullOr(Schema.Union([Schema.Boolean, Schema.Number, Schema.String]))),
  acceptedAnswers: Schema.optional(Schema.NullOr(Schema.Array(Schema.String))),
  items: Schema.optional(Schema.NullOr(Schema.Array(Schema.String))),
  orderMatters: Schema.optional(Schema.NullOr(Schema.Boolean)),
  tolerance: Schema.optional(Schema.NullOr(Schema.Number)),
  unit: text,
  rubric: Schema.optional(
    Schema.NullOr(Schema.Array(Schema.Struct({ criterion: Schema.String, points: Schema.optional(Schema.NullOr(Schema.Number)) }))),
  ),
});
type RawQuestion = typeof RawQuestion.Type;

const RawReply = Schema.Struct({ questions: Schema.Array(Schema.Unknown) });
const decodeReply = Schema.decodeUnknownOption(RawReply);
const decodeRaw = Schema.decodeUnknownOption(RawQuestion);
const decodeQuestion = Schema.decodeUnknownOption(Question);

const newId = () => crypto.randomUUID().slice(0, 8);
const halves = (n: number) => Math.round(n * 2) / 2;

// Rubric rows whose points are in half steps and add up to `total`, each at least half a point. The model's
// points only set the proportions; rows that don't fit (more than 2 per point) are dropped from the end.
export const fitRubric = (
  rows: readonly { criterion: string; points?: number | null | undefined }[],
  total: number,
): RubricRow[] => {
  const named = rows.map((r) => ({ criterion: r.criterion.trim(), points: r.points })).filter((r) => r.criterion !== "");
  const kept = named.slice(0, Math.max(0, Math.min(12, Math.floor(total * 2))));
  if (kept.length === 0) return [];
  const weights = kept.map((r) => (typeof r.points === "number" && Number.isFinite(r.points) && r.points > 0 ? r.points : 1));
  const sum = weights.reduce((a, b) => a + b, 0);
  const points = weights.map((w) => Math.max(0.5, halves((w / sum) * total)));
  let diff = halves(total - points.reduce((a, b) => a + b, 0));
  // Move the difference onto rows, largest first, a half point at a time.
  const order = points.map((_, i) => i).sort((a, b) => points[b]! - points[a]!);
  for (let guard = 0; diff !== 0 && guard < 1000; guard++) {
    const step = diff > 0 ? 0.5 : -0.5;
    const i = order.find((j) => points[j]! + step >= 0.5);
    if (i === undefined) break;
    points[i] = points[i]! + step;
    diff = halves(diff - step);
    order.sort((a, b) => (step > 0 ? points[a]! - points[b]! : points[b]! - points[a]!));
  }
  return kept.map((r, i) => ({ id: newId(), criterion: r.criterion, points: points[i]! }));
};

const clean = (s: string | null | undefined) => (s && s.trim() !== "" ? s.trim() : undefined);

// One of the model's questions as a contract Question, or null when it doesn't hold up.
export const toQuestion = (raw: RawQuestion, points: number): Question | null => {
  const prompt = raw.prompt.trim();
  if (prompt === "") return null;
  const base = {
    id: newId(),
    prompt,
    points,
    gamePoints: "standard" as const,
    partialCredit: false,
    ...(clean(raw.topic) ? { topic: clean(raw.topic)! } : {}),
    ...(clean(raw.explanation) ? { explanation: clean(raw.explanation)! } : {}),
  };
  let question: unknown;
  switch (raw.type) {
    case "multiple_choice": {
      const choices = (raw.choices ?? []).map((c) => ({ id: newId(), text: c.text.trim(), correct: c.correct })).filter((c) => c.text !== "");
      const correct = choices.filter((c) => c.correct);
      if (choices.length < 2 || choices.length > 10 || correct.length === 0 || correct.length === choices.length) return null;
      question = {
        ...base,
        type: "multiple_choice",
        choices: choices.map(({ id, text }) => ({ id, text })),
        correctChoiceIds: correct.map((c) => c.id),
        multipleCorrect: correct.length > 1,
      };
      break;
    }
    case "true_false":
      if (typeof raw.answer === "boolean") question = { ...base, type: "true_false", answer: raw.answer };
      else if (typeof raw.answer === "string" && /^(true|false)$/i.test(raw.answer.trim()))
        question = { ...base, type: "true_false", answer: raw.answer.trim().toLowerCase() === "true" };
      else return null;
      break;
    case "blank": {
      // Identification: one answer box, so the prompt has no {{blanks}}.
      const accepted = [...new Set((raw.acceptedAnswers ?? (typeof raw.answer === "string" ? [raw.answer] : [])).map((a) => a.trim()).filter(Boolean))];
      if (accepted.length === 0 || prompt.includes("{{")) return null;
      question = {
        ...base,
        type: "blank",
        mode: "fill",
        caseSensitive: false,
        acceptedAnswers: accepted,
        clozeInput: "typed",
        wrongOptions: [],
        extraWords: [],
      };
      break;
    }
    case "enumeration": {
      const items = (raw.items ?? []).map((i) => i.trim()).filter(Boolean);
      if (items.length < 2) return null;
      question = { ...base, type: "enumeration", items, orderMatters: raw.orderMatters ?? false, caseSensitive: false };
      break;
    }
    case "numeric": {
      const answer = typeof raw.answer === "number" ? raw.answer : typeof raw.answer === "string" ? Number(raw.answer) : NaN;
      if (!Number.isFinite(answer) || (typeof raw.answer === "string" && raw.answer.trim() === "")) return null;
      const tolerance = raw.tolerance ?? 0;
      question = { ...base, type: "numeric", answer, tolerance: Number.isFinite(tolerance) && tolerance > 0 ? tolerance : 0, unit: raw.unit?.trim() ?? "" };
      break;
    }
    case "essay":
      question = { ...base, type: "essay", rubric: fitRubric(raw.rubric ?? [], points) };
      break;
    default:
      return null;
  }
  const decoded = decodeQuestion(question);
  return decoded._tag === "Some" ? decoded.value : null;
};

// The questions that hold up out of the model's reply, with how many items it held.
export const mapGenerated = (reply: unknown, points: number): { questions: Question[]; received: number } => {
  const parsed = decodeReply(reply);
  if (parsed._tag === "None") return { questions: [], received: 0 };
  const questions: Question[] = [];
  for (const item of parsed.value.questions) {
    const raw = decodeRaw(item);
    const q = raw._tag === "Some" ? toQuestion(raw.value, points) : null;
    if (q) questions.push(q);
  }
  return { questions, received: parsed.value.questions.length };
};

export type GradeInput = {
  prompt: string;
  points: number;
  rubric: readonly RubricRow[];
  answer: string;
  feedbackStyle: AiFeedbackStyle;
};

const RawGrade = Schema.Struct({
  score: Schema.Union([Schema.Number, Schema.NumberFromString]),
  feedback: Schema.optional(Schema.NullOr(Schema.String)),
  rubricRowIds: Schema.optional(Schema.NullOr(Schema.Array(Schema.String))),
});
const decodeGrade = Schema.decodeUnknownOption(RawGrade);

// The model's reply as a suggestion: the score is kept between 0 and the question's points in half steps, and
// only rubric rows that exist stay. null when the reply has no usable score.
export const toSuggestion = (
  reply: unknown,
  input: Pick<GradeInput, "points" | "rubric">,
  provider: AiProvider,
  model: string,
): AiGradeSuggestion | null => {
  const parsed = decodeGrade(reply);
  if (parsed._tag === "None" || !Number.isFinite(parsed.value.score)) return null;
  const known = new Set(input.rubric.map((r) => r.id));
  return {
    provider,
    model,
    score: Math.min(Math.max(halves(parsed.value.score), 0), input.points),
    feedback: (parsed.value.feedback ?? "").trim(),
    rubricRowIds: [...new Set(parsed.value.rubricRowIds ?? [])].filter((id) => known.has(id)),
    createdAt: new Date().toISOString(),
  };
};

const RawCoach = Schema.Struct({
  headline: Schema.String,
  narrative_assessment: Schema.String,
  primary_takeaways: Schema.Array(Schema.String),
  recommended_drill_topic: Schema.optional(Schema.NullOr(Schema.String)),
});
const decodeCoach = Schema.decodeUnknownOption(RawCoach);

// The model's reply as a report; null when it doesn't have the shape asked for or says nothing.
export const toCoachReport = (reply: unknown): CoachReport | null => {
  const parsed = decodeCoach(reply);
  if (parsed._tag === "None") return null;
  const r = parsed.value;
  const takeaways = r.primary_takeaways.map((t) => t.trim()).filter((t) => t !== "");
  if (r.headline.trim() === "" || r.narrative_assessment.trim() === "" || takeaways.length === 0) return null;
  return {
    headline: r.headline.trim(),
    narrativeAssessment: r.narrative_assessment.trim(),
    primaryTakeaways: takeaways,
    recommendedDrillTopic: r.recommended_drill_topic?.trim() || null,
  };
};
