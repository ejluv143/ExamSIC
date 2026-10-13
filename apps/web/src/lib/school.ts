import type { PaperHeader, PaperSettings } from "@examinus/domain/quiz";

// Defaults for new papers; each quiz keeps its own copy so it can be changed.
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
  // Filled in with the signed-in teacher's name when a quiz is created.
  instructor: "",
  generalInstructions: defaultGeneralInstructions,
  footer: {
    documentNo: "SIC-F-CIM-03",
    effectivityDate: "August 3, 2026",
    revisionNo: "00",
    member: "Member: PAASCU, CEAP, BUACS",
    motto: "Forming Competent Men and Women of Prayer and Service for Others",
  },
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
