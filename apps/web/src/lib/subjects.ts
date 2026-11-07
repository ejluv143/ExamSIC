// Subject types decide which question types an exam offers (each kind lists its subjects in packages/domain/src/kinds).
import type { SubjectArea } from "@examinus/domain/roles";

export type { SubjectArea };

export const subjectAreaLabel: Record<SubjectArea, string> = {
  general: "General",
  english: "English",
  math: "Mathematics",
  science: "Science",
  programming: "Programming / IT",
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
