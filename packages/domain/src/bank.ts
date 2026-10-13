// Question bank tags and shares: the pure rules. Tags are free text; blank means "no tag".
import type { Question } from "./question.ts";

// What a share covers: every question of the owner with a subject, or with a topic (in any subject), or one question.
export const bankShareScopes = ["subject", "topic", "question"] as const;
export type BankShareScope = (typeof bankShareScopes)[number];

export const maxTagLength = 120;

// A tag as stored: trimmed, null when blank or absent.
export const normalizeTag = (tag: string | null | undefined): string | null => {
  const trimmed = tag?.trim();
  return trimmed ? trimmed : null;
};

// The question with its `topic` set to the (normalized) tag, or without a topic when there is none. The bank's
// `topic` column and `Question.topic` must always agree, so every write goes through here.
export const withTopic = (question: Question, topic: string | null | undefined): Question => {
  const { topic: _old, ...rest } = question;
  const tag = normalizeTag(topic);
  return (tag === null ? rest : { ...rest, topic: tag }) as Question;
};
