import { newBase, rescaleRubric, rubricHeading, rubricProblem, rubricSummary, defaultPlaceholder } from "../shared/editor-model";
import type { EditorModel } from "../views/editor-model";

export const essayModel: EditorModel<"essay"> = {
  type: "essay",
  create: (id) => ({ ...newBase(id), type: "essay", rubric: [] }),
  validate: rubricProblem,
  promptPlaceholder: defaultPlaceholder,
  answer: rubricHeading,
  summary: rubricSummary,
  rescale: rescaleRubric,
  sheet: {
    aliases: ["essay", "open-ended", "open ended"],
    defaultPoints: 10,
    parse: ({ base, answer, points }) => ({
      ...base,
      type: "essay",
      rubric: answer ? [{ id: "r1", criterion: answer, points }] : [],
    }),
  },
};
