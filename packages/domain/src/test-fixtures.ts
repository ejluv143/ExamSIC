// Question builders for the domain tests: one per question type, each a complete teacher question that can be
// adjusted with `over`. Used by the *.test.ts files only.
import type { Question } from "./question.ts";

type Of<T extends Question["type"]> = Extract<Question, { type: T }>;
const base = { prompt: "Prompt", points: 4, gamePoints: "standard", partialCredit: false } as const;

export const mc = (over: Partial<Of<"multiple_choice">> = {}): Of<"multiple_choice"> => ({
  ...base,
  id: "mc",
  type: "multiple_choice",
  choices: [
    { id: "a", text: "Alpha" },
    { id: "b", text: "Beta" },
    { id: "c", text: "Gamma" },
    { id: "d", text: "Delta" },
  ],
  correctChoiceIds: ["a"],
  multipleCorrect: false,
  ...over,
});

export const tf = (over: Partial<Of<"true_false">> = {}): Of<"true_false"> => ({
  ...base,
  id: "tf",
  type: "true_false",
  answer: true,
  ...over,
});

export const blank = (over: Partial<Of<"blank">> = {}): Of<"blank"> => ({
  ...base,
  id: "bl",
  type: "blank",
  prompt: "A {{primary key|PK}} identifies a {{row}}.",
  caseSensitive: false,
  clozeInput: "typed",
  wrongOptions: [],
  extraWords: [],
  ...over,
});

export const matching = (over: Partial<Of<"matching">> = {}): Of<"matching"> => ({
  ...base,
  id: "ma",
  type: "matching",
  left: [
    { id: "l1", text: "Dog", rightId: "r1" },
    { id: "l2", text: "Cat", rightId: "r2" },
    { id: "l3", text: "Cow", rightId: "r3" },
    { id: "l4", text: "Owl", rightId: "r1" },
  ],
  right: [
    { id: "r1", text: "Bark" },
    { id: "r2", text: "Meow" },
    { id: "r3", text: "Moo" },
    { id: "r4", text: "Quack" },
  ],
  ...over,
});

export const enumeration = (over: Partial<Of<"enumeration">> = {}): Of<"enumeration"> => ({
  ...base,
  id: "en",
  type: "enumeration",
  items: ["1NF|First Normal Form", "2NF", "3NF", "BCNF"],
  orderMatters: false,
  caseSensitive: false,
  ...over,
});

export const numeric = (over: Partial<Of<"numeric">> = {}): Of<"numeric"> => ({
  ...base,
  id: "nu",
  type: "numeric",
  answer: 3.14,
  tolerance: 0.01,
  unit: "cm",
  ...over,
});

export const essay = (over: Partial<Of<"essay">> = {}): Of<"essay"> => ({
  ...base,
  id: "es",
  type: "essay",
  rubric: [
    { id: "r1", criterion: "Thesis", points: 1 },
    { id: "r2", criterion: "Evidence", points: 3 },
  ],
  ...over,
});

export const code = (over: Partial<Of<"code">> = {}): Of<"code"> => ({
  ...base,
  id: "co",
  type: "code",
  language: "python",
  starterCode: "print()",
  tests: [
    { id: "t1", input: "1", expectedOutput: "1", hidden: false },
    { id: "t2", input: "2", expectedOutput: "2", hidden: true },
    { id: "t3", input: "3", expectedOutput: "3", hidden: true },
    { id: "t4", input: "4", expectedOutput: "4", hidden: false },
  ],
  rubric: "Style",
  ...over,
});

export const sql = (over: Partial<Of<"sql">> = {}): Of<"sql"> => ({
  ...base,
  id: "sq",
  type: "sql",
  setupSql: "CREATE TABLE t (a INT);",
  answerSql: "SELECT a FROM t",
  hiddenDataSql: "",
  orderMatters: false,
  starterCode: "SELECT ",
  rubric: "",
  ...over,
});

export const drawing = (over: Partial<Of<"drawing">> = {}): Of<"drawing"> => ({
  ...base,
  id: "dr",
  type: "drawing",
  allowDraw: true,
  allowUpload: true,
  cameraOnly: false,
  canvasWidth: 800,
  canvasHeight: 600,
  rubric: [{ id: "r1", criterion: "Neat", points: 4 }],
  ...over,
});

export const categorization = (over: Partial<Of<"categorization">> = {}): Of<"categorization"> => ({
  ...base,
  id: "ca",
  type: "categorization",
  categories: [
    { id: "fruit", name: "Fruit" },
    { id: "veg", name: "Vegetable" },
  ],
  items: [
    { id: "i1", text: "Apple", categoryId: "fruit" },
    { id: "i2", text: "Carrot", categoryId: "veg" },
    { id: "i3", text: "Pear", categoryId: "fruit" },
    { id: "i4", text: "Rock", categoryId: null },
  ],
  ...over,
});

export const ordering = (over: Partial<Of<"ordering">> = {}): Of<"ordering"> => ({
  ...base,
  id: "or",
  type: "ordering",
  items: [
    { id: "o1", text: "First" },
    { id: "o2", text: "Second" },
    { id: "o3", text: "Third" },
    { id: "o4", text: "Fourth" },
  ],
  ...over,
});

export const hotspot = (over: Partial<Of<"hotspot">> = {}): Of<"hotspot"> => ({
  ...base,
  id: "ho",
  type: "hotspot",
  imageId: "img",
  alt: "Map",
  maxClicks: 2,
  tolerance: 0,
  regions: [
    { id: "g1", shape: "rect", x: 0, y: 0, w: 0.2, h: 0.2, label: "North" },
    { id: "g2", shape: "ellipse", x: 0.6, y: 0.6, w: 0.2, h: 0.2 },
  ],
  ...over,
});

// One of every type, in the order of `questionTypes`.
export const oneOfEach = (): Question[] => [
  mc(),
  tf(),
  blank(),
  matching(),
  enumeration(),
  numeric(),
  essay(),
  code(),
  sql(),
  drawing(),
  categorization(),
  ordering(),
  hotspot(),
];
