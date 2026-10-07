import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { requirePermission, requireTeacher } from "@/lib/auth/dal";
import { contentAssetUrls, getClasses, getQuestionBank, schoolPaper, schoolProfile } from "@/lib/data/teacher";
import { emptyPart, type EditorQuiz } from "@/lib/quiz-editor";
import { guessSubjectArea } from "@/lib/subjects";
import { QuizEditor } from "../_editor/quiz-editor";

export const metadata: Metadata = { title: "New quiz" };

export default async function NewQuizPage(props: PageProps<"/teacher/assessments/new">) {
  await requirePermission({ assessment: ["create"] });
  const { class: classId, tab } = await props.searchParams;
  const [user, classes, bank] = await Promise.all([requireTeacher(), getClasses(), getQuestionBank()]);

  // Started from a class: its subject comes along.
  const fromClass = typeof classId === "string" ? classes.find((c) => c.id === classId) : undefined;

  const initial: EditorQuiz = {
    id: "new",
    title: "",
    description: "",
    ...(fromClass
      ? {
          subject: fromClass.courseCode,
          subjectArea: fromClass.subjectArea ?? guessSubjectArea(fromClass.courseCode, fromClass.title),
        }
      : {}),
    header: { ...schoolProfile, period: null, dates: "" },
    paper: { ...structuredClone(schoolPaper), instructor: user.name },
    parts: [emptyPart("")],
    settings: { shuffleQuestions: false, shuffleChoices: false, shuffleParts: false },
  };

  // The bank's pictures, for the "add from bank" list.
  const assetUrls = await contentAssetUrls(bank);

  return (
    <>
      <PageHeader back={{ href: "/teacher/assessments", label: "Quizzes & exams" }} title="New quiz" />
      <QuizEditor
        initial={initial}
        classes={classes}
        bank={bank}
        sessionDates=""
        initialTab={tab === "paper" ? "paper" : "questions"}
        assetUrls={assetUrls}
      />
    </>
  );
}
