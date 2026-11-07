// The icons for the names an answer heading carries (`AnswerIcon` in packages/domain/src/kinds/editor.ts).
import type { AnswerIcon } from "@examinus/domain/kinds/editor";
import { CircleCheckBig, ClipboardCheck, type LucideIcon } from "lucide-react";

export const answerIcons: Record<AnswerIcon, LucideIcon> = {
  key: CircleCheckBig,
  rubric: ClipboardCheck,
  tests: CircleCheckBig,
};
