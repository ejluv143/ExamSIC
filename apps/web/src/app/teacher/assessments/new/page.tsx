import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { requirePermission, requireTeacher } from "@/lib/auth/dal";
import { getClasses, getQuestionBank, schoolPaper, schoolProfile } from "@/lib/data/teacher";
import { defaultIntegrity } from "@/lib/integrity";
import { guessSubjectArea } from "@/lib/subjects";
import type { Assessment } from "@/lib/types";
import { AssessmentEditor } from "../_editor/assessment-editor";

export const metadata: Metadata = { title: "New assessment" };

export default async function NewAssessmentPage(props: PageProps<"/teacher/assessments/new">) {
  await requirePermission({ assessment: ["create"] });
  const { kind: rawKind, class: classId, tab } = await props.searchParams;
  const kind = rawKind === "quiz" ? "quiz" : "exam";
  const [user, classes, bank] = await Promise.all([requireTeacher(), getClasses(), getQuestionBank()]);

  // Started from a class: its subject comes along.
  const fromClass = typeof classId === "string" ? classes.find((c) => c.id === classId) : undefined;

  const initial: Assessment = {
    id: "new",
    kind,
    title: "",
    subject: fromClass?.courseCode,
    subjectArea: fromClass ? (fromClass.subjectArea ?? guessSubjectArea(fromClass.courseCode, fromClass.title)) : undefined,
    paper: { ...structuredClone(schoolPaper), instructor: user.name },
    header: { ...schoolProfile, period: kind === "exam" ? "midterm" : null, dates: "" },
    description: "",
    classIds: typeof classId === "string" && classes.some((c) => c.id === classId) ? [classId] : [],
    status: "draft",
    resultsReleased: false,
    questions: [],
    settings: {
      timeLimitMinutes: kind === "exam" ? 60 : null,
      opensAt: null,
      closesAt: null,
      shuffleQuestions: kind === "exam",
      shuffleChoices: kind === "exam",
      attemptsAllowed: 1,
      resultsRelease: kind === "exam" ? "manual" : "immediately",
      integrity: defaultIntegrity(kind),
      countInRecord: true,
    },
    updatedAt: new Date().toISOString(),
  };

  return (
    <>
      <PageHeader
        back={{ href: "/teacher/assessments", label: "Quizzes & exams" }}
        title={kind === "exam" ? "New exam" : "New quiz"}
      />
      <AssessmentEditor initial={initial} classes={classes} bank={bank} initialTab={tab === "paper" ? "paper" : "questions"} />
    </>
  );
}
