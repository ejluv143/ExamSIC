// The icons for the names an editor model's answer heading carries (`AnswerHeading.icon` in question-kinds-core).
import type { AnswerIcon } from "@examinus/question-kinds-core/editor-shared";
import { CircleCheckBig, ClipboardCheck, type LucideIcon } from "lucide-react";

export const answerIcons: Record<AnswerIcon, LucideIcon> = {
  key: CircleCheckBig,
  rubric: ClipboardCheck,
  tests: CircleCheckBig,
};
