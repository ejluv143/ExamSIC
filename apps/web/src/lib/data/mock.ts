// Demo data used until the API exists. Only src/lib/data/ should import this file.
import type { Assessment, Class, Question, Student, Submission } from "../types";

// Demo login. The password is plain text only because this is mock data.
export const users = [
  {
    id: "t1",
    role: "teacher" as const,
    name: "Prof. Reyes",
    email: "j.reyes@sic.edu.ph",
    department: "School of Information Technology",
    password: "examora-demo",
  },
];

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
    questions: bank("q1", "q2", "q3", "q4", "q11", "q5", "q7", "q12", "q6"),
    settings: {
      timeLimitMinutes: 90,
      opensAt: "2026-10-01T09:00:00+08:00",
      closesAt: "2026-10-01T11:00:00+08:00",
      shuffleQuestions: true,
      shuffleChoices: true,
      attemptsAllowed: 1,
      resultsRelease: "manual",
      trackTabSwitches: true,
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
    questions: bank("q2", "q4", "q3"),
    settings: {
      timeLimitMinutes: 10,
      opensAt: "2026-10-06T08:00:00+08:00",
      closesAt: "2026-10-08T23:59:00+08:00",
      shuffleQuestions: false,
      shuffleChoices: true,
      attemptsAllowed: 2,
      resultsRelease: "immediately",
      trackTabSwitches: false,
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
    questions: bank("q8", "q9", "q14", "q13", "q15", "q10"),
    settings: {
      timeLimitMinutes: 60,
      opensAt: "2026-10-09T13:00:00+08:00",
      closesAt: "2026-10-09T14:30:00+08:00",
      shuffleQuestions: true,
      shuffleChoices: true,
      attemptsAllowed: 1,
      resultsRelease: "after_close",
      trackTabSwitches: true,
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
    questions: bank("q1"),
    settings: {
      timeLimitMinutes: null,
      opensAt: null,
      closesAt: null,
      shuffleQuestions: false,
      shuffleChoices: false,
      attemptsAllowed: 1,
      resultsRelease: "immediately",
      trackTabSwitches: false,
    },
    updatedAt: "2026-10-06T07:45:00+08:00",
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
          answers[q.id] = right ? q.acceptedAnswers[0].toLowerCase() : "WHERE";
          break;
        case "fill_in_the_blank":
          answers[q.id] = right ? ["primary key", "FK"] : ["primary key", "index"];
          break;
        case "numeric":
          answers[q.id] = right ? String(q.answer) : String(q.answer + 1);
          break;
        case "enumeration":
          answers[q.id] = right ? ["Deletion", "insertion", "update"] : ["insertion", "redundancy", ""];
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
      tabSwitches: rand() < 0.2 ? 1 + Math.floor(rand() * 4) : 0,
    };
  });
}

export const submissions: Submission[] = buildSubmissions();
