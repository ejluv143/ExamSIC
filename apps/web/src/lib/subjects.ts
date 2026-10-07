// Subject types decide which question types an exam offers: a programming exam gets code and SQL
// questions, a math exam numeric answers, an English exam essays and fill in the blanks.
import type { QuestionType, SubjectArea } from "@examora/contract";

export const subjectAreaLabel: Record<SubjectArea, string> = {
  general: "General",
  english: "English",
  math: "Mathematics",
  science: "Science",
  programming: "Programming / IT",
};

// Multiple choice, identification and enumeration fit every subject; each type adds its own.
const common: QuestionType[] = ["multiple_choice", "identification", "enumeration"];
export const questionTypesFor: Record<SubjectArea, QuestionType[]> = {
  general: common,
  english: [...common, "fill_in_the_blank", "true_false", "essay"],
  math: [...common, "numeric", "true_false"],
  science: [...common, "true_false", "numeric", "essay"],
  programming: [...common, "code", "sql", "true_false", "fill_in_the_blank"],
};

// A best guess from the course code and title, for classes whose subject type isn't set.
export function guessSubjectArea(courseCode: string, title: string): SubjectArea {
  const text = `${courseCode} ${title}`.toLowerCase();
  if (/\b(it|cs|is|comp|prog)\w*|program|database|software|web|network|data struct|algorithm/.test(text)) return "programming";
  if (/\b(eng|purcom|lit)\w*|english|literature|communication|writing|grammar/.test(text)) return "english";
  if (/\b(math|calc|stat|alg)\w*|math|calculus|statistic|algebra|geometry|logic/.test(text)) return "math";
  if (/\b(sci|bio|chem|phys)\w*|science|biology|chemistry|physics/.test(text)) return "science";
  return "general";
}
