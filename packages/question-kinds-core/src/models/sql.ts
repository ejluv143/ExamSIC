import { previewText } from "../preview-text.ts";
import { checkQuery } from "../sql.ts";
import { newBase, testsHeading, defaultPlaceholder } from "../editor-shared.ts";
import type { EditorModel } from "../editor-model.ts";

export const sqlTemplate = `CREATE TABLE students (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    program TEXT
);

INSERT INTO students VALUES
    (1, 'Ana Cruz', 'BSIT'),
    (2, 'Ben Reyes', 'BSCS'),
    (3, 'Carla Lim', 'BSIT');
`;

export const sqlModel: EditorModel<"sql"> = {
  type: "sql",
  create: (id) => ({
    ...newBase(id),
    type: "sql",
    setupSql: sqlTemplate,
    answerSql: "",
    hiddenDataSql: "",
    orderMatters: false,
    starterCode: "SELECT ",
    rubric: "",
  }),
  validate(q) {
    if (!q.setupSql.trim()) return "has no tables (setup SQL).";
    const problem = checkQuery(q.answerSql);
    return problem ? `answer query: ${problem}` : null;
  },
  promptPlaceholder: defaultPlaceholder,
  answer: testsHeading,
  partialCredit: { applies: () => true, hint: "Each check earns its share." },
  summary: (q) => (q.answerSql.trim() ? previewText(q.answerSql).slice(0, 80) : "No answer query"),
};
