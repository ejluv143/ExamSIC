// Pure helpers of the AI feature: key encryption, and reading what the providers reply with.
import { type AiGradeSuggestion } from "@examinus/contract/ai";
import { AiDraft, draftQuestion, type AiFeedbackStyle, type AiProvider } from "@examinus/domain/ai";
import { type CoachReport } from "@examinus/domain/analytics";
import type { Question } from "@examinus/domain/question";
import { type RubricRow } from "@examinus/domain/kinds/base";
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

const RawReply = Schema.Struct({ questions: Schema.Array(Schema.Unknown) });
const decodeReply = Schema.decodeUnknownOption(RawReply);
const decodeRaw = Schema.decodeUnknownOption(AiDraft);

const newId = () => crypto.randomUUID().slice(0, 8);
const halves = (n: number) => Math.round(n * 2) / 2;

// The questions that hold up out of the model's reply, with how many items it held.
export const mapGenerated = (reply: unknown, points: number): { questions: Question[]; received: number } => {
  const parsed = decodeReply(reply);
  if (parsed._tag === "None") return { questions: [], received: 0 };
  const questions: Question[] = [];
  for (const item of parsed.value.questions) {
    const raw = decodeRaw(item);
    const q = raw._tag === "Some" ? draftQuestion(raw.value, points, newId) : null;
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
