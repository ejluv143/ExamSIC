// The integrity level of each student's latest submitted attempt, the way the anti-cheating page works it out:
// the attempts' own events, what students share, and typing histories that look pasted or automatic.
import { analyzeSession, type AttemptDetail, type Question } from "@examora/contract";
import { isSubmitted, latestSubmitted } from "./attempt-view";
import { analyzeTyping } from "./typing";

export function sessionIntegrity(questions: readonly Question[], attempts: readonly AttemptDetail[]) {
  const submitted = attempts.filter(isSubmitted);
  // Code and SQL start from the starter code; essays and blanks start empty.
  const typed = questions.filter((q) => q.type === "code" || q.type === "sql" || q.type === "essay" || q.type === "blank");
  const oddTyping = submitted.flatMap((sub) =>
    typed.flatMap((question) => {
      const log = sub.typing[question.id];
      const value = sub.answers.find((a) => a.questionId === question.id)?.value;
      if (!log || typeof value !== "string") return [];
      const starter = question.type === "code" || question.type === "sql" ? question.starterCode : "";
      const analysis = analyzeTyping(starter, log, value);
      return analysis.flags.length ? [{ sub, question, analysis }] : [];
    }),
  );
  const typingFlags: Record<string, number> = {};
  for (const o of oddTyping) typingFlags[o.sub.attempt.id] = (typingFlags[o.sub.attempt.id] ?? 0) + 1;
  const latest = latestSubmitted(submitted);
  const analysis = analyzeSession({ attempts: [...latest.values()], questions, typingFlags });
  return { submitted, latest, typed, oddTyping, analysis };
}
