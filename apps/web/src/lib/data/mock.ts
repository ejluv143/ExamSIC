// Demo data used until the API exists. Only src/lib/data/ should import this file.
import type { Assessment, Class, ClassRecord, IntegrityEvent, Question, RecordItem, Student, Submission } from "../types";
import { defaultIntegrity } from "../integrity";
import { maxScore } from "../scoring";

const firstNames = [
  "Andrea", "Miguel", "Bea", "Carlo", "Denise", "Enzo", "Francine", "Gabriel",
  "Hannah", "Ivan", "Jasmine", "Kyle", "Lara", "Marco", "Nicole", "Paolo",
  "Rica", "Sean", "Trisha", "Vince", "Yna", "Zach", "Alyssa", "Bryan",
];
const lastNames = [
  "Santos", "Reyes", "Cruz", "Bautista", "Garcia", "Mendoza", "Torres", "Flores",
  "Ramos", "Villanueva", "Aquino", "Castillo", "Navarro", "Domingo", "Lopez", "Rivera",
  "Morales", "Pascual", "Salazar", "Dela Cruz", "Gonzales", "Fernandez", "Soriano", "Valdez",
];

export const students: Student[] = firstNames.map((first, i) => {
  const last = lastNames[i];
  return {
    id: `s${i + 1}`,
    studentNumber: `2023-${String(10241 + i * 37).padStart(5, "0")}`,
    firstName: first,
    lastName: last,
    email: `${first}.${last.replace(" ", "")}@student.sic.edu.ph`.toLowerCase(),
    // The demo first names alternate female and male.
    sex: i % 2 === 0 ? "F" : "M",
  };
});

const ids = (from: number, to: number) =>
  students.slice(from, to).map((s) => s.id);

export const classes: Class[] = [
  {
    id: "c1",
    courseCode: "IT302",
    title: "Database Management Systems",
    section: "BSIT 3-A",
    term: "1st Sem 2026–2027",
    schedule: "MWF 9:00–10:30 AM",
    room: "Lab 204",
    units: 3,
    classroom: {
      courseId: "683920114527",
      link: "https://classroom.google.com/c/683920114527",
      lastSyncedAt: "2026-10-06T07:30:00+08:00",
    },
    studentIds: ids(0, 14),
  },
  {
    id: "c2",
    courseCode: "GEA101",
    title: "Business Logic",
    section: "BSIT 1-B",
    term: "1st Sem 2026–2027",
    schedule: "TTh 1:00–2:30 PM",
    room: "Room 312",
    units: 3,
    classroom: {
      courseId: "683920118841",
      link: "https://classroom.google.com/c/683920118841",
      lastSyncedAt: "2026-10-06T07:30:00+08:00",
    },
    studentIds: ids(8, 24),
  },
  {
    id: "c3",
    courseCode: "ITPROF EL1",
    title: "Professional Elective 1",
    section: "BSIT 4-A",
    term: "1st Sem 2026–2027",
    schedule: "Sat 8:00–11:00 AM",
    room: "Lab 101",
    units: 3,
    classroom: {
      courseId: "683920120365",
      link: "https://classroom.google.com/c/683920120365",
      lastSyncedAt: "2026-10-06T07:30:00+08:00",
    },
    studentIds: ids(16, 24),
  },
];

export const questionBank: Question[] = [
  {
    id: "q1",
    type: "multiple_choice",
    topic: "Normalization",
    prompt: "Which normal form removes partial dependencies on a composite primary key?",
    points: 2,
    choices: [
      { id: "a", text: "First Normal Form (1NF)" },
      { id: "b", text: "Second Normal Form (2NF)" },
      { id: "c", text: "Third Normal Form (3NF)" },
      { id: "d", text: "Boyce–Codd Normal Form (BCNF)" },
    ],
    correctChoiceId: "b",
  },
  {
    id: "q2",
    type: "multiple_choice",
    topic: "SQL",
    prompt: "Which JOIN returns all rows from the left table and matching rows from the right table?",
    points: 2,
    choices: [
      { id: "a", text: "INNER JOIN" },
      { id: "b", text: "LEFT JOIN" },
      { id: "c", text: "RIGHT JOIN" },
      { id: "d", text: "CROSS JOIN" },
    ],
    correctChoiceId: "b",
  },
  {
    id: "q3",
    type: "true_false",
    topic: "Keys",
    prompt: "A table can have more than one candidate key.",
    points: 1,
    answer: true,
  },
  {
    id: "q4",
    type: "identification",
    topic: "SQL",
    prompt: "What SQL clause filters groups after aggregation?",
    points: 2,
    acceptedAnswers: ["HAVING", "HAVING clause"],
    caseSensitive: false,
  },
  {
    id: "q5",
    type: "true_false",
    topic: "Transactions",
    prompt: "The 'I' in ACID stands for Integrity.",
    points: 1,
    answer: false,
  },
  {
    id: "q6",
    type: "essay",
    topic: "Normalization",
    prompt:
      "Explain why over-normalizing a reporting database can hurt performance. Give one example.",
    points: 10,
    rubric:
      "4 pts: explains join cost / read performance. 3 pts: concrete, correct example. 3 pts: mentions when denormalization is appropriate.",
  },
  {
    id: "q7",
    type: "identification",
    topic: "Keys",
    prompt: "A column in one table that references the primary key of another table is called a ___.",
    points: 2,
    acceptedAnswers: ["foreign key", "FK"],
    caseSensitive: false,
  },
  {
    id: "q8",
    type: "multiple_choice",
    topic: "Propositional logic",
    prompt: "Which statement is logically equivalent to ¬(P ∧ Q)?",
    points: 2,
    choices: [
      { id: "a", text: "¬P ∧ ¬Q" },
      { id: "b", text: "¬P ∨ ¬Q" },
      { id: "c", text: "P ∨ Q" },
      { id: "d", text: "¬P → Q" },
    ],
    correctChoiceId: "b",
  },
  {
    id: "q9",
    type: "true_false",
    topic: "Propositional logic",
    prompt: "An implication P → Q is false only when P is true and Q is false.",
    points: 1,
    answer: true,
  },
  {
    id: "q10",
    type: "essay",
    topic: "Decision tables",
    prompt: "Build a decision table for a store discount rule of your choice and explain each condition.",
    points: 10,
    rubric: "4 pts: correct conditions/actions. 3 pts: complete rule coverage. 3 pts: clear explanation.",
  },
  {
    id: "q11",
    type: "fill_in_the_blank",
    topic: "Keys",
    prompt: "A [primary key|PK] uniquely identifies each row, while a [foreign key|FK] links it to another table.",
    points: 2,
    caseSensitive: false,
  },
  {
    id: "q12",
    type: "enumeration",
    topic: "Normalization",
    prompt: "Give the three data anomalies that normalization prevents.",
    points: 3,
    items: ["insertion|insertion anomaly", "update|update anomaly|modification", "deletion|deletion anomaly"],
    orderMatters: false,
    caseSensitive: false,
  },
  {
    id: "q13",
    type: "numeric",
    topic: "Algebra",
    prompt: "Solve for $x$: $\\frac{2x + 3}{5} = 3$",
    points: 2,
    answer: 6,
    tolerance: 0,
    unit: "",
  },
  {
    id: "q14",
    type: "multiple_choice",
    topic: "Algebra",
    prompt: "Which is equal to $\\sqrt{50}$?",
    points: 2,
    choices: [
      { id: "a", text: "$25$" },
      { id: "b", text: "$5\\sqrt{2}$" },
      { id: "c", text: "$2\\sqrt{5}$" },
      { id: "d", text: "$10\\sqrt{5}$" },
    ],
    correctChoiceId: "b",
  },
  {
    id: "q15",
    type: "numeric",
    topic: "Geometry",
    prompt: "A circle has radius $r = 4$ cm. What is its area? Use $\\pi \\approx 3.14$.",
    points: 2,
    answer: 50.24,
    tolerance: 0.01,
    unit: "cm²",
  },
];

const bank = (...qids: string[]) =>
  qids.map((id) => structuredClone(questionBank.find((q) => q.id === id)!));

const paperDefaults = {
  schoolLogoUrl: "/logos/san-isidro-college.png",
  departmentLogoUrl: "/logos/school-of-it.png",
  school: "San Isidro College",
  schoolAddress: "City of Malaybalay",
  department: "School of Information Technology",
  semester: "first" as const,
  academicYear: "2026-2027",
  dates: "",
};

const paperSettings: Assessment["paper"] = {
  size: "long",
  answerSheet: false,
  instructor: "Prof. Reyes",
  generalInstructions: [
    "PRAY before you start.",
    "READ and follow all instructions carefully for each test section.",
    "WRITE your answers clearly and neatly using a black or blue pen.",
    "AVOID erasures, alterations, or superimpositions on your answer sheet.",
    "MANAGE your time wisely and review your answers before submitting.",
    "MAINTAIN academic integrity cheating in any form will result in disciplinary action.",
  ],
  footer: {
    documentNo: "SIC-F-CIM-03",
    effectivityDate: "August 3, 2026",
    revisionNo: "00",
    member: "Member: PAASCU, CEAP, BUACS",
    motto: "Forming Competent Men and Women of Prayer and Service for Others",
  },
  parts: { multiple_choice: { title: "Conceptual Understanding", instructions: "" } },
};

export const assessments: Assessment[] = [
  {
    id: "a1",
    kind: "exam",
    title: "IT302 Midterm Exam",
    paper: paperSettings,
    header: { ...paperDefaults, period: "midterm" },
    description: "Covers ER modeling, keys, normalization and basic SQL. Closed notes.",
    classIds: ["c1"],
    status: "closed",
    resultsReleased: true,
    questions: bank("q1", "q2", "q3", "q4", "q11", "q5", "q7", "q12", "q6"),
    settings: {
      timeLimitMinutes: 90,
      opensAt: "2026-10-01T09:00:00+08:00",
      closesAt: "2026-10-01T11:00:00+08:00",
      shuffleQuestions: true,
      shuffleChoices: true,
      attemptsAllowed: 1,
      resultsRelease: "manual",
      integrity: defaultIntegrity("exam"),
    },
    updatedAt: "2026-09-29T15:20:00+08:00",
  },
  {
    id: "a2",
    kind: "quiz",
    title: "SQL Joins Quick Check",
    paper: paperSettings,
    header: { ...paperDefaults, period: "midterm" },
    description: "Five-minute warm-up before the lab.",
    classIds: ["c1"],
    status: "open",
    resultsReleased: false,
    questions: bank("q2", "q4", "q3"),
    settings: {
      timeLimitMinutes: 10,
      opensAt: "2026-10-06T08:00:00+08:00",
      closesAt: "2026-10-08T23:59:00+08:00",
      shuffleQuestions: false,
      shuffleChoices: true,
      attemptsAllowed: 2,
      resultsRelease: "immediately",
      integrity: defaultIntegrity("quiz"),
    },
    updatedAt: "2026-10-05T20:10:00+08:00",
  },
  {
    id: "a3",
    kind: "exam",
    title: "GEA101 Prelim Exam",
    paper: paperSettings,
    header: { ...paperDefaults, period: "prelim" },
    description: "Propositional logic and decision tables.",
    classIds: ["c2"],
    status: "scheduled",
    resultsReleased: false,
    questions: bank("q8", "q9", "q14", "q13", "q15", "q10"),
    settings: {
      timeLimitMinutes: 60,
      opensAt: "2026-10-09T13:00:00+08:00",
      closesAt: "2026-10-09T14:30:00+08:00",
      shuffleQuestions: true,
      shuffleChoices: true,
      attemptsAllowed: 1,
      resultsRelease: "after_close",
      integrity: defaultIntegrity("exam"),
    },
    updatedAt: "2026-10-04T11:00:00+08:00",
  },
  {
    id: "a4",
    kind: "quiz",
    title: "Normalization Practice",
    paper: paperSettings,
    header: { ...paperDefaults, period: null },
    description: "",
    classIds: ["c1"],
    status: "draft",
    resultsReleased: false,
    questions: bank("q1"),
    settings: {
      timeLimitMinutes: null,
      opensAt: null,
      closesAt: null,
      shuffleQuestions: false,
      shuffleChoices: false,
      attemptsAllowed: 1,
      resultsRelease: "immediately",
      integrity: defaultIntegrity("quiz"),
    },
    updatedAt: "2026-10-06T07:45:00+08:00",
  },
  {
    // Open now so the demo student can try a full exam (full screen, tab log, every question type).
    id: "a5",
    kind: "exam",
    title: "IT302 Practice Exam",
    paper: paperSettings,
    header: { ...paperDefaults, period: "midterm" },
    description: "Practice run of the midterm format. Closed notes. Stay in full screen until you submit.",
    classIds: ["c1"],
    status: "open",
    resultsReleased: false,
    questions: bank("q1", "q2", "q3", "q4", "q11", "q5", "q7", "q12", "q6"),
    settings: {
      timeLimitMinutes: 30,
      opensAt: "2026-10-07T00:00:00+08:00",
      closesAt: "2026-10-31T23:59:00+08:00",
      shuffleQuestions: true,
      shuffleChoices: true,
      attemptsAllowed: 3,
      resultsRelease: "immediately",
      integrity: { ...defaultIntegrity("exam"), autoSubmitAfter: 3 },
    },
    updatedAt: "2026-10-07T08:00:00+08:00",
  },
];

// Deterministic "random" so the demo looks the same on every render.
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

const sampleEssay = [
  "Too many tables means every report needs many joins, which slows reads. For example, a sales report that joins orders, order_items, products, categories and customers for each row. Denormalized summary tables can help for read-heavy reporting.",
  "Normalization reduces redundancy but reporting queries then need more joins. A star schema is often used instead.",
  "It is bad because it is slow.",
];

// A spread of other alerts so the anti-cheating page has something to show.
function demoAlerts(i: number): IntegrityEvent[] {
  const at = (minute: number) => `2026-10-01T09:${String(minute).padStart(2, "0")}:00+08:00`;
  const events: IntegrityEvent[] = [];
  if (i === 3) events.push({ type: "copy", at: at(20) });
  if (i % 5 === 1) events.push({ type: "exit_fullscreen", at: at(15) }, { type: "window_resize", at: at(16) });
  if (i % 6 === 2) events.push({ type: "right_click", at: at(22) }, { type: "right_click", at: at(23) });
  if (i === 7) events.push({ type: "alt_tab", at: at(31) }, { type: "paste", at: at(32) }, { type: "alt_tab", at: at(40) });
  if (i === 10) events.push({ type: "second_screen", at: at(5) }, { type: "mouse_left", at: at(6) });
  return events;
}

function buildSubmissions(): Submission[] {
  const exam = assessments.find((a) => a.id === "a1")!;
  const cls = classes.find((c) => c.id === "c1")!;
  const rand = seeded(42);
  return cls.studentIds.map((studentId, i) => {
    const answers: Submission["answers"] = {};
    const manualScores: Record<string, number> = {};
    for (const q of exam.questions) {
      const right = rand() < 0.72;
      switch (q.type) {
        case "multiple_choice":
          answers[q.id] = right ? q.correctChoiceId : q.choices.find((c) => c.id !== q.correctChoiceId)!.id;
          break;
        case "true_false":
          answers[q.id] = right ? q.answer : !q.answer;
          break;
        case "identification":
          // Some wrong answers are near-misses the teacher may want to accept when reviewing.
          answers[q.id] = right ? q.acceptedAnswers[0].toLowerCase() : i % 2 ? q.acceptedAnswers[0].slice(0, -1) : "WHERE";
          break;
        case "fill_in_the_blank":
          answers[q.id] = right ? ["primary key", "FK"] : ["primary key", "index"];
          break;
        case "numeric":
          answers[q.id] = right ? String(q.answer) : String(q.answer + 1);
          break;
        case "enumeration":
          answers[q.id] = right ? ["Deletion", "insertion", "update"] : ["insertion", "updating", "delete"];
          break;
        case "essay":
          answers[q.id] = sampleEssay[i % sampleEssay.length];
          // The first few are already graded, the rest wait for the teacher.
          if (i < 5) manualScores[q.id] = [9, 6, 3][i % 3];
          break;
      }
    }
    const graded = Object.keys(manualScores).length > 0;
    return {
      id: `sub-a1-${studentId}`,
      assessmentId: "a1",
      studentId,
      startedAt: "2026-10-01T09:02:00+08:00",
      submittedAt: `2026-10-01T10:${String(10 + Math.floor(rand() * 40)).padStart(2, "0")}:00+08:00`,
      status: graded ? "graded" : "needs_grading",
      answers,
      manualScores,
      feedback: {},
      // Some students left the exam page a few times; one also tried to copy.
      integrityEvents: Array.from({ length: rand() < 0.2 ? 1 + Math.floor(rand() * 4) : 0 }, (_, k): IntegrityEvent => ({
        type: "left_page",
        at: `2026-10-01T09:${String(10 + k * 12).padStart(2, "0")}:00+08:00`,
      })).concat(demoAlerts(i)),
    };
  });
}

export const submissions: Submission[] = buildSubmissions();

// Class records (grade books), laid out like the school's Excel sheet. It's mid-semester: midterm
// work is partly in, finals haven't started. Linked items take their scores from Examora submissions.
function buildRecord(
  cls: Class,
  seed: number,
  midterm: { name: string; weight: number; isExam?: boolean; items: Omit<RecordItem, "id">[] }[],
): ClassRecord {
  const rand = seeded(seed);
  const terms = {
    midterm: midterm.map((c, i) => ({
      id: `${cls.id}-m${i}`,
      name: c.name,
      weight: c.weight,
      isExam: !!c.isExam,
      items: c.items.map((item, j) => ({ ...item, id: `${cls.id}-m${i}-${j}` })),
    })),
    // Same categories for finals, nothing recorded yet.
    final: midterm.map((c, i) => ({ id: `${cls.id}-f${i}`, name: c.name, weight: c.weight, isExam: !!c.isExam, items: [] })),
  };
  // Each student has a steady "ability" so their scores look consistent across items.
  const ability = Object.fromEntries(cls.studentIds.map((id) => [id, 0.55 + rand() * 0.4]));
  const scores: ClassRecord["scores"] = {};
  for (const cat of terms.midterm)
    for (const item of cat.items) {
      if (item.assessmentId) continue;
      scores[item.id] = Object.fromEntries(
        cls.studentIds.map((id) => [
          id,
          rand() < 0.04 ? null : Math.min(item.maxScore, Math.round(item.maxScore * (ability[id] + (rand() - 0.5) * 0.2))),
        ]),
      );
    }
  return {
    classId: cls.id,
    terms,
    scores,
    absences: {
      midterm: Object.fromEntries(cls.studentIds.map((id) => [id, Math.floor(rand() * rand() * 5)])),
      final: {},
    },
    dropped: [],
    signatories: { dean: "Dr. Elena V. Cruz", vpaa: "Dr. Ramon T. Villanueva", registrar: "Ms. Grace L. Santos" },
  };
}

const total = (id: string) => maxScore(assessments.find((a) => a.id === id)!.questions);

export const classRecords: ClassRecord[] = [
  buildRecord(classes.find((c) => c.id === "c1")!, 7, [
    {
      name: "Quizzes",
      weight: 20,
      items: [
        { title: "Quiz 1: ER diagrams", maxScore: 20, assessmentId: null },
        { title: "SQL Joins Quick Check", maxScore: total("a2"), assessmentId: "a2" },
        { title: "Quiz 3: Keys", maxScore: 15, assessmentId: null },
      ],
    },
    {
      name: "Laboratory activities",
      weight: 25,
      items: [
        { title: "Lab 1: Creating tables", maxScore: 50, assessmentId: null },
        { title: "Lab 2: SELECT and WHERE", maxScore: 50, assessmentId: null },
      ],
    },
    {
      name: "Recitation",
      weight: 15,
      items: [{ title: "Recitation", maxScore: 30, assessmentId: null }],
    },
    {
      name: "Midterm exam",
      weight: 40,
      isExam: true,
      items: [{ title: "IT302 Midterm Exam", maxScore: total("a1"), assessmentId: "a1" }],
    },
  ]),
  buildRecord(classes.find((c) => c.id === "c2")!, 11, [
    {
      name: "Quizzes",
      weight: 25,
      items: [
        { title: "Quiz 1: Propositions", maxScore: 20, assessmentId: null },
        { title: "Quiz 2: Truth tables", maxScore: 20, assessmentId: null },
      ],
    },
    {
      name: "Seatwork",
      weight: 25,
      items: [{ title: "Seatwork 1: Decision tables", maxScore: 30, assessmentId: null }],
    },
    {
      name: "Recitation",
      weight: 10,
      items: [{ title: "Recitation", maxScore: 20, assessmentId: null }],
    },
    {
      name: "Prelim exam",
      weight: 40,
      isExam: true,
      items: [{ title: "GEA101 Prelim Exam", maxScore: total("a3"), assessmentId: "a3" }],
    },
  ]),
];
