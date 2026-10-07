// Demo data used until the API exists. Only src/lib/data/ should import this file.
import type { AnswerValue, Assessment, AttendanceStatus, Class, ClassMeeting, ClassRecord, IntegrityEvent, Question, RecordItem, Student, Submission } from "../types";
import { academicCalendar, meetingDays } from "../attendance";
import { defaultIntegrity } from "../integrity";
import type { TypingEdit } from "../typing";
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

const enrollmentSchema = `CREATE TABLE students (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    program TEXT NOT NULL
);
CREATE TABLE courses (
    id INTEGER PRIMARY KEY,
    code TEXT NOT NULL,
    title TEXT NOT NULL
);
CREATE TABLE enrollments (
    student_id INTEGER REFERENCES students(id),
    course_id INTEGER REFERENCES courses(id)
);

INSERT INTO students VALUES
    (1, 'Ana Cruz', 'BSIT'),
    (2, 'Ben Reyes', 'BSIT'),
    (3, 'Carla Lim', 'BSCS'),
    (4, 'Dino Santos', 'BSIT');
INSERT INTO courses VALUES
    (1, 'IT302', 'Database Management Systems'),
    (2, 'IT304', 'Web Development'),
    (3, 'GEA101', 'Business Logic'),
    (4, 'IT201', 'Data Structures');
INSERT INTO enrollments VALUES
    (1, 1), (1, 2), (2, 1), (3, 1), (3, 3);
`;

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
  {
    id: "q16",
    type: "code",
    topic: "Programming basics",
    prompt:
      "Read a whole number n, then n numbers, one per line. Print the sum of the even numbers. If there are none, print 0.",
    points: 10,
    language: "python",
    starterCode: "n = int(input())\n\n# Read the n numbers and add up the even ones.\n",
    tests: [
      { id: "t1", input: "5\n1\n2\n3\n4\n5", expectedOutput: "6", hidden: false },
      { id: "t2", input: "3\n1\n3\n5", expectedOutput: "0", hidden: false },
      { id: "t3", input: "4\n-2\n10\n7\n0", expectedOutput: "8", hidden: true },
      { id: "t4", input: "1\n100", expectedOutput: "100", hidden: true },
    ],
    rubric: "Uses a loop and an if/modulo check. Reads exactly n numbers.",
  },
  {
    id: "q17",
    type: "code",
    topic: "Programming basics",
    prompt: "Read one line of text and print its words in reverse order, separated by single spaces.",
    points: 10,
    language: "javascript",
    starterCode: "const line = readline();\n\n// Print the words in reverse order with console.log().\n",
    tests: [
      { id: "t1", input: "hello world", expectedOutput: "world hello", hidden: false },
      { id: "t2", input: "SELECT name FROM students", expectedOutput: "students FROM name SELECT", hidden: false },
      { id: "t3", input: "one", expectedOutput: "one", hidden: true },
      { id: "t4", input: "  extra   spaces here ", expectedOutput: "here spaces extra", hidden: true },
    ],
    rubric: "Handles extra spaces (split on whitespace, drop empty words).",
  },
  {
    id: "q18",
    type: "sql",
    topic: "SQL joins",
    prompt: "List the name of each student with the title of every course they are enrolled in.",
    points: 5,
    setupSql: enrollmentSchema,
    answerSql:
      "SELECT s.name, c.title\nFROM enrollments e\nJOIN students s ON s.id = e.student_id\nJOIN courses c ON c.id = e.course_id;",
    hiddenDataSql: "INSERT INTO students VALUES (5, 'Ella Tan', 'BSIT');\nINSERT INTO enrollments VALUES (5, 2), (4, 3);",
    orderMatters: false,
    starterCode: "SELECT ",
    rubric: "Two INNER JOINs through enrollments.",
  },
  {
    id: "q19",
    type: "sql",
    topic: "SQL aggregates",
    prompt:
      "Show each course title and how many students are enrolled in it, including courses with no students. Most students first; break ties by title A–Z.",
    points: 5,
    setupSql: enrollmentSchema,
    answerSql:
      "SELECT c.title, COUNT(e.student_id) AS enrolled\nFROM courses c\nLEFT JOIN enrollments e ON e.course_id = c.id\nGROUP BY c.id\nORDER BY enrolled DESC, c.title;",
    hiddenDataSql:
      "INSERT INTO courses VALUES (5, 'IT305', 'Networking');\nINSERT INTO enrollments VALUES (2, 2), (4, 2), (4, 4);",
    orderMatters: true,
    starterCode: "SELECT ",
    rubric: "LEFT JOIN so empty courses show 0; COUNT a column from enrollments, not *.",
  },
  {
    id: "q20",
    type: "code",
    topic: "Laravel",
    prompt:
      "Read a course code. Using Laravel (the DB facade or Eloquent), print the names of the students enrolled in that course, A–Z, one per line. If nobody is enrolled, print No students.",
    points: 10,
    language: "php",
    database: enrollmentSchema,
    starterCode:
      "<?php\n\n// The tables are in a database you can query with Laravel:\n// DB::table('students')->where(...)->get(), DB::select(...), or Eloquent models.\n\n$code = trim(fgets(STDIN));\n\n",
    tests: [
      { id: "t1", input: "IT302", expectedOutput: "Ana Cruz\nBen Reyes\nCarla Lim", hidden: false },
      { id: "t2", input: "IT201", expectedOutput: "No students", hidden: false },
      { id: "t3", input: "IT304", expectedOutput: "Ana Cruz", hidden: true },
      { id: "t4", input: "GEA101", expectedOutput: "Carla Lim", hidden: true },
    ],
    rubric: "Joins through enrollments (or uses a belongsToMany relationship) and sorts by name.",
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
    questions: bank("q2", "q4", "q3", "q18"),
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
    questions: bank("q1", "q2", "q3", "q4", "q11", "q5", "q7", "q12", "q6", "q18", "q19", "q16", "q17", "q20"),
    settings: {
      timeLimitMinutes: 45,
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

// A plausible answer to the IT302 bank questions, right or wrong.
function sampleAnswer(q: Question, right: boolean, i: number): AnswerValue {
  switch (q.type) {
    case "multiple_choice":
      return right ? q.correctChoiceId : q.choices.find((c) => c.id !== q.correctChoiceId)!.id;
    case "true_false":
      return right ? q.answer : !q.answer;
    case "identification":
      // Some wrong answers are near-misses the teacher may want to accept when reviewing.
      return right ? q.acceptedAnswers[0].toLowerCase() : i % 2 ? q.acceptedAnswers[0].slice(0, -1) : "WHERE";
    case "fill_in_the_blank":
      return right ? ["primary key", "FK"] : ["primary key", "index"];
    case "numeric":
      return right ? String(q.answer) : String(q.answer + 1);
    case "enumeration":
      return right ? ["Deletion", "insertion", "update"] : ["insertion", "updating", "delete"];
    case "essay":
      return sampleEssay[i % sampleEssay.length];
    default:
      return null;
  }
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
      answers[q.id] = sampleAnswer(q, right, i);
      // The first few essays are already graded, the rest wait for the teacher.
      if (q.type === "essay" && i < 5) manualScores[q.id] = [9, 6, 3][i % 3];
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


// --- Practice exam (a5): code and SQL answers with typing histories, for the replay and similarity check ---

// Python "sum of the even numbers" answers, after the starter code.
const evensA = "total = 0\nfor i in range(n):\n    x = int(input())\n    if x % 2 == 0:\n        total += x\nprint(total)\n";
// evensA with every name changed and a comment added: a copy.
const evensB = "# my answer\ns = 0\nfor k in range(n):\n    val = int(input())\n    if val % 2 == 0:\n        s += val\nprint(s)\n";
const evensC = "nums = [int(input()) for _ in range(n)]\nprint(sum(v for v in nums if v % 2 == 0))\n";
const evensD = "result = 0\ncount = 0\nwhile count < n:\n    num = int(input())\n    count += 1\n    if num % 2 != 1:\n        result = result + num\nprint(result)\n";
const evensE = "evens = 0\nfor _ in range(n):\n    num = int(input())\n    evens += num if num % 2 == 0 else 0\nprint(evens)\n";
// JavaScript "reverse the words" answers.
const reverse1 = 'const words = line.trim().split(/\\s+/);\nconsole.log(words.reverse().join(" "));\n';
const reverse2 = 'let parts = line.split(" ").filter((w) => w !== "");\nlet out = [];\nfor (let i = parts.length - 1; i >= 0; i--) out.push(parts[i]);\nconsole.log(out.join(" "));\n';
const reverse3 = 'let items = line.split(" ").filter((x) => x !== "");\nlet res = [];\nfor (let j = items.length - 1; j >= 0; j--) res.push(items[j]);\nconsole.log(res.join(" "));\n';
const reverse4 = 'console.log(line.split(" ").reverse().join(" "));\n';
const joinQuery = "SELECT s.name, c.title\nFROM enrollments e\nJOIN students s ON s.id = e.student_id\nJOIN courses c ON c.id = e.course_id;";
const countQuery =
  "SELECT c.title, COUNT(e.student_id) AS total\nFROM courses c\nLEFT JOIN enrollments e ON e.course_id = c.id\nGROUP BY c.title\nORDER BY total DESC, c.title;";

type TypingStyle = "natural" | "paste" | "robot";

// An edit history that types `added` after `initial`, starting `atMs` into the attempt.
function typingFor(initial: string, added: string, style: TypingStyle, atMs: number, rand: () => number): TypingEdit[] {
  const at = initial.length;
  if (style === "paste") return [[atMs + 40_000, at, at, added]];
  const edits: TypingEdit[] = [];
  let t = atMs;
  let pos = at;
  for (const ch of added) {
    if (style === "robot") t += 18;
    else {
      t += 70 + Math.floor(rand() * 260) + (ch === "\n" ? 700 + Math.floor(rand() * 2500) : 0);
      if (rand() < 0.015) t += 20_000 + Math.floor(rand() * 40_000); // stopped to think
      if (rand() < 0.04 && /[a-z]/.test(ch)) {
        // A typo, then backspace.
        edits.push([t, pos, pos, "q"]);
        t += 150 + Math.floor(rand() * 200);
        edits.push([t, pos, pos + 1, ""]);
        t += 80;
      }
    }
    edits.push([t, pos, pos, ch]);
    pos++;
  }
  return edits;
}

// Who wrote what, and how. Student 1 copied student 0; student 4 auto-typed student 7's code;
// student 2 pasted; student 6's history doesn't match what they submitted (it's student 3's code).
// The two short JavaScript one-liners are each written by three students: common, not copied.
const practicePlan: { evens: string; evensStyle: TypingStyle; reverse: string; reverseStyle: TypingStyle }[] = [
  { evens: evensA, evensStyle: "natural", reverse: reverse1, reverseStyle: "natural" },
  { evens: evensB, evensStyle: "natural", reverse: reverse3, reverseStyle: "natural" },
  { evens: evensC, evensStyle: "paste", reverse: reverse2, reverseStyle: "natural" },
  { evens: evensD, evensStyle: "natural", reverse: reverse4, reverseStyle: "natural" },
  { evens: evensE, evensStyle: "robot", reverse: reverse1, reverseStyle: "natural" },
  { evens: "", evensStyle: "natural", reverse: reverse4, reverseStyle: "natural" },
  { evens: evensD, evensStyle: "natural", reverse: reverse4, reverseStyle: "natural" },
  { evens: evensE, evensStyle: "natural", reverse: reverse1, reverseStyle: "natural" },
];

function buildPracticeSubmissions(): Submission[] {
  const exam = assessments.find((a) => a.id === "a5")!;
  const roster = classes.find((c) => c.id === "c1")!.studentIds.filter((id) => id !== "s9").slice(0, practicePlan.length);
  const rand = seeded(7);
  return roster.map((studentId, i) => {
    const plan = practicePlan[i];
    const answers: Submission["answers"] = {};
    const typing: Record<string, TypingEdit[]> = {};
    for (const q of exam.questions) {
      if (q.type === "code") {
        const isEvens = q.language === "python";
        const added = isEvens ? plan.evens : plan.reverse;
        const style = isEvens ? plan.evensStyle : plan.reverseStyle;
        answers[q.id] = q.starterCode + added;
        // Student 6 typed evensE but submitted evensD: the history doesn't add up.
        const typedText = isEvens && i === 6 ? evensE : added;
        typing[q.id] = added ? typingFor(q.starterCode, typedText, style, isEvens ? 6 * 60_000 : 18 * 60_000, rand) : [];
      } else if (q.type === "sql") {
        const query = q.orderMatters ? countQuery : joinQuery;
        answers[q.id] = query;
        // Starter is "SELECT "; type the rest after replacing it.
        typing[q.id] = [[25 * 60_000, 0, q.starterCode.length, ""], ...typingFor("", query, "natural", 25 * 60_000, rand)];
      } else answers[q.id] = sampleAnswer(q, rand() < 0.7, i);
    }
    return {
      id: `sub-a5-${studentId}`,
      assessmentId: "a5",
      studentId,
      startedAt: "2026-10-07T08:05:00+08:00",
      submittedAt: `2026-10-07T08:${String(40 + i).padStart(2, "0")}:00+08:00`,
      status: "needs_grading",
      answers,
      manualScores: {},
      feedback: {},
      integrityEvents: i === 2 ? [{ type: "switched_app", at: "2026-10-07T08:44:00+08:00" }] : [],
      typing,
    };
  });
}

export const submissions: Submission[] = [...buildSubmissions(), ...buildPracticeSubmissions()];

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
    // Same categories for finals (the major exam becomes the final exam), nothing recorded yet.
    final: midterm.map((c, i) => ({
      id: `${cls.id}-f${i}`,
      name: c.isExam ? "Final exam" : c.name,
      weight: c.weight,
      isExam: !!c.isExam,
      items: [],
    })),
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

// --- Attendance: every class meeting from the start of the semester up to today ---

const manilaToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });

function buildMeetings(): ClassMeeting[] {
  const today = manilaToday();
  const meetings: ClassMeeting[] = [];
  const rand = seeded(21);
  for (const cls of classes) {
    const days = meetingDays(cls.schedule);
    const dates: string[] = [];
    for (let d = new Date(`${academicCalendar.semesterStart}T00:00:00Z`); ; d.setUTCDate(d.getUTCDate() + 1)) {
      const date = d.toISOString().slice(0, 10);
      if (date > today || date > academicCalendar.semesterEnd) break;
      if (days.includes(d.getUTCDay())) dates.push(date);
    }
    dates.forEach((date, n) => {
      const isToday = date === today;
      const records: Record<string, AttendanceStatus> = {};
      if (!isToday)
        cls.studentIds.forEach((sid, i) => {
          const r = rand();
          let status: AttendanceStatus = r < 0.03 ? "absent" : r < 0.09 ? "late" : r < 0.1 ? "excused" : "present";
          // A few students near the limits so the rules show: in IT302 the 3rd student has 4 absences (drop),
          // the 6th has 3 (one away), and the 9th was late 7 times (= 1 absence) plus absent once.
          if (cls.id === "c1") {
            if (i === 2) status = n % 5 === 1 ? "absent" : "present";
            if (i === 5) status = n % 8 === 2 ? "absent" : "present";
            if (i === 8) status = n % 3 === 0 && n < 21 ? "late" : n === 4 ? "absent" : "present";
          }
          if (status !== "present") records[sid] = status;
        });
      meetings.push({
        id: `${cls.id}-${date}`,
        classId: cls.id,
        date,
        records,
        takenAt: isToday ? null : `${date}T12:00:00+08:00`,
      });
    });
  }
  return meetings;
}

export const meetings: ClassMeeting[] = buildMeetings();
