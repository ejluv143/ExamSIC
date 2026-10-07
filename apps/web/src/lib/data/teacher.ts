// Data access for the teacher module. Reads mock data for now; each function
// becomes a fetch to the API later, keeping the same signature.
import { requirePermission } from "../auth/dal";
import { assessments, classes, questionBank, students, submissions } from "./mock";
import type { Assessment, AssessmentKind, AssessmentStatus, PaperHeader, PaperSettings } from "../types";

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

// The teacher's Google account that classes are imported from.
export async function getClassroomConnection() {
  const user = await requirePermission({ class: ["read"] });
  return { email: user.email, lastSyncedAt: "2026-10-06T07:30:00+08:00" };
}

export async function getClasses() {
  await requirePermission({ class: ["read"] });
  return classes;
}

export async function getClass(id: string) {
  await requirePermission({ class: ["read"] });
  return classes.find((c) => c.id === id) ?? null;
}

export async function getStudents(ids: string[]) {
  await requirePermission({ roster: ["read"] });
  return students
    .filter((s) => ids.includes(s.id))
    .sort((a, b) => a.lastName.localeCompare(b.lastName));
}

export async function getStudent(id: string) {
  await requirePermission({ roster: ["read"] });
  return students.find((s) => s.id === id) ?? null;
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
