// The anti-cheating case file of a session as the teacher's pages read it: the domain's findings, plus the typing
// analysis (which lives with the typing replay) of code, SQL, essay and blank answers.
import { type AttemptDetail } from "@examinus/contract/session";
import { type Question } from "@examinus/domain/question";
import { checkTyping, integrityCaseFile } from "@examinus/domain/session-integrity";
import { analyzeTyping } from "@examinus/taking/typing-analysis";

export const typingCheck = (questions: readonly Question[], attempts: readonly AttemptDetail[]) =>
  checkTyping({ questions, attempts, flagsOf: (starter, log, final) => analyzeTyping(starter, log, final).flags });

export const sessionIntegrity = (questions: readonly Question[], attempts: readonly AttemptDetail[]) =>
  integrityCaseFile({ questions, attempts, typing: typingCheck(questions, attempts) });
