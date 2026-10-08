import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/dal";
import { formatDateRange } from "@/lib/format";
import { contentAssetUrls, getClasses, getQuestionBank, getQuiz, listSessions } from "@/lib/data/teacher";
import { toEditorQuiz } from "@/lib/quiz-editor";
import { QuizEditor } from "../../_editor/quiz-editor";

export const metadata: Metadata = { title: "Edit quiz" };

export default async function EditQuizPage(props: PageProps<"/teacher/assessments/[quizId]/edit">) {
  await requirePermission({ assessment: ["update"] });
  const { quizId } = await props.params;
  const { tab, view } = await props.searchParams;
  const [detail, classes, bank, sessions] = await Promise.all([
    getQuiz(quizId),
    getClasses(),
    getQuestionBank(),
    listSessions({ quizId }),
  ]);
  if (!detail) notFound();

  const quiz = toEditorQuiz(detail);
  // The quiz's own pictures, and the bank's for the "add from bank" list.
  const assetUrls = await contentAssetUrls([detail, bank]);
  // Newest session first.
  const latest = sessions[0]?.session;
  // After a save the page reloads, so the editor starts over from what the server stored.
  const version = `${detail.quiz.updatedAt}:${detail.parts.map((p) => p.id).join(",")}`;

  return (
    <>
      <QuizEditor
        key={version}
        initial={quiz}
        classes={classes}
        bank={bank}
        sessionDates={latest ? formatDateRange(latest.opensAt, latest.closesAt) : ""}
        initialPaperOpen={tab === "paper"}
        assetUrls={assetUrls}
        initialView={view === "table" ? "table" : "cards"}
      />
    </>
  );
}
