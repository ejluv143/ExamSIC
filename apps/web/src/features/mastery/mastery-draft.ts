import { defaultMastery, masteryMaxRetries, type MasterySettings } from "@examinus/domain/quiz";

// The mastery settings as the form holds them while the teacher types.
export type MasteryDraft = { retryLimit: string; targetPercent: string; showCorrectAnswer: boolean };

export const masteryDraft = (saved: MasterySettings | null | undefined): MasteryDraft => {
  const s = saved ?? defaultMastery;
  return {
    retryLimit: String(s.retryLimit),
    targetPercent: s.targetPercent === null ? "" : String(s.targetPercent),
    showCorrectAnswer: s.showCorrectAnswer,
  };
};

// The settings to save, or the problems to show the teacher.
export function masteryFromDraft(d: MasteryDraft): { settings: MasterySettings } | { problems: string[] } {
  const retryLimit = Number(d.retryLimit);
  const target = d.targetPercent.trim() === "" ? null : Number(d.targetPercent);
  const problems: string[] = [];
  if (!Number.isInteger(retryLimit) || retryLimit < 1 || retryLimit > masteryMaxRetries)
    problems.push(`Tries per question must be a whole number from 1 to ${masteryMaxRetries}.`);
  if (target !== null && (!Number.isInteger(target) || target < 1 || target > 100))
    problems.push("The target score must be a whole percent from 1 to 100.");
  return problems.length
    ? { problems }
    : { settings: { retryLimit, targetPercent: target, showCorrectAnswer: d.showCorrectAnswer } };
}
