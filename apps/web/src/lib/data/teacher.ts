// Data access for the teacher module. Classes and rosters come from the API; the rest is mock data for now,
// and each function becomes a fetch to the API later, keeping the same signature.
import type { ClassFields } from "@examora/contract";
import { requirePermission } from "../auth/dal";
import { apiCall, apiValue, messageOf, toClass, toStudent } from "./api";
import { assessments, questionBank, submissions } from "./mock";
import type { Assessment, AssessmentKind, AssessmentStatus, Class, PaperHeader, PaperSettings, Student } from "../types";

// Defaults for new papers; each assessment keeps its own copy so it can be changed.
export const defaultGeneralInstructions = [
  "PRAY before you start.",
  "READ and follow all instructions carefully for each test section.",
  "WRITE your answers clearly and neatly using a black or blue pen.",
  "AVOID erasures, alterations, or superimpositions on your answer sheet.",
  "MANAGE your time wisely and review your answers before submitting.",
  "MAINTAIN academic integrity cheating in any form will result in disciplinary action.",
];

export const schoolPaper: PaperSettings = {
  size: "long",
  answerSheet: false,
  // Filled in with the signed-in teacher's name when an assessment is created.
  instructor: "",
  generalInstructions: defaultGeneralInstructions,
  footer: {
    documentNo: "SIC-F-CIM-03",
    effectivityDate: "August 3, 2026",
    revisionNo: "00",
    member: "Member: PAASCU, CEAP, BUACS",
    motto: "Forming Competent Men and Women of Prayer and Service for Others",
  },
  parts: {},
};

export const schoolProfile: Omit<PaperHeader, "period" | "dates"> = {
  schoolLogoUrl: "/logos/san-isidro-college.png",
  departmentLogoUrl: "/logos/school-of-it.png",
  school: "San Isidro College",
  schoolAddress: "City of Malaybalay",
  department: "School of Information Technology",
  semester: "first",
  academicYear: "2026-2027",
};

// The signed-in teacher's classes (archived ones left out).
export async function getClasses(): Promise<Class[]> {
  await requirePermission({ class: ["read"] });
  return (await apiValue((api) => api["class.list"]())).map(toClass);
}

// One of the signed-in teacher's classes, or null.
export async function getClass(id: string): Promise<Class | null> {
  await requirePermission({ class: ["read"] });
  const cls = await apiValue((api) => api["class.get"]({ classId: id }));
  return cls && toClass(cls);
}

// Students on the teacher's rosters; ids from other classes are left out.
export async function getStudents(ids: string[]): Promise<Student[]> {
  await requirePermission({ roster: ["read"] });
  if (ids.length === 0) return [];
  const list = await apiValue((api) => api["class.students"]({ studentIds: ids }));
  return list.map(toStudent).sort((a, b) => a.lastName.localeCompare(b.lastName));
}

export async function getStudent(id: string) {
  return (await getStudents([id]))[0] ?? null;
}

// Creates a class with a new join code; returns its id.
export async function createClass(fields: ClassFields): Promise<string> {
  await requirePermission({ class: ["create"] });
  return (await apiValue((api) => api["class.create"](fields))).id;
}

// The rest return an error message, or null when done.
export async function updateClass(classId: string, fields: ClassFields) {
  await requirePermission({ class: ["update"] });
  return messageOf(await apiCall((api) => api["class.update"]({ classId, fields })));
}

export async function archiveClass(classId: string) {
  await requirePermission({ class: ["delete"] });
  return messageOf(await apiCall((api) => api["class.archive"]({ classId })));
}

export async function newJoinCode(classId: string) {
  await requirePermission({ class: ["update"] });
  return messageOf(await apiCall((api) => api["class.newJoinCode"]({ classId })));
}

export async function removeStudent(classId: string, studentId: string) {
  await requirePermission({ roster: ["update"] });
  return messageOf(await apiCall((api) => api["class.removeStudent"]({ classId, studentId })));
}

export async function getAssessments(filter?: {
  kind?: AssessmentKind;
  status?: AssessmentStatus;
  classId?: string;
}) {
  await requirePermission({ assessment: ["read"] });
  return assessments
    .filter(
      (a) =>
        (!filter?.kind || a.kind === filter.kind) &&
        (!filter?.status || a.status === filter.status) &&
        (!filter?.classId || a.classIds.includes(filter.classId)),
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getAssessment(id: string): Promise<Assessment | null> {
  await requirePermission({ assessment: ["read"] });
  return assessments.find((a) => a.id === id) ?? null;
}

export async function getSubmissions(assessmentId: string) {
  await requirePermission({ submission: ["read"] });
  return submissions.filter((s) => s.assessmentId === assessmentId);
}

export async function getSubmission(id: string) {
  await requirePermission({ submission: ["read"] });
  return submissions.find((s) => s.id === id) ?? null;
}

export async function getQuestionBank() {
  await requirePermission({ questionBank: ["read"] });
  return questionBank;
}

// Saves a quiz or exam from the editor (new ones get an id). Published ones then show up for students and,
// unless marked not to count, in their classes' class records.
// TODO: PUT to the API. The mock keeps it in memory until the dev server restarts.
export async function saveAssessment(raw: Assessment): Promise<{ id: string } | { error: string }> {
  await requirePermission({ assessment: ["create", "update"] });
  if (!raw || typeof raw.title !== "string" || !raw.title.trim()) return { error: "Add a title." };
  if (raw.kind !== "quiz" && raw.kind !== "exam") return { error: "Choose quiz or exam." };
  if (!Array.isArray(raw.questions) || raw.questions.length > 300) return { error: "Too many questions." };
  if (!["draft", "scheduled", "open", "closed"].includes(raw.status)) return { error: "Unknown status." };
  const mine = new Set((await getClasses()).map((c) => c.id));
  const classIds = (raw.classIds ?? []).filter((id) => mine.has(id));
  const id = raw.id === "new" || !assessments.some((a) => a.id === raw.id) ? `a-${crypto.randomUUID().slice(0, 8)}` : raw.id;
  const saved: Assessment = { ...structuredClone(raw), id, classIds, updatedAt: new Date().toISOString() };
  const i = assessments.findIndex((a) => a.id === id);
  if (i === -1) assessments.push(saved);
  else assessments[i] = saved;
  return { id };
}