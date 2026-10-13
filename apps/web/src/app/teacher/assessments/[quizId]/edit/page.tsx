import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/dal";
import { formatDateRange } from "@/lib/format";
import { listBank } from "@/features/bank/data";
import { contentAssetUrls, getQuiz } from "@/features/quiz/data";
import { getClasses } from "@/features/classes/data";
import { listSessions } from "@/features/session/data";
import { toEditorQuiz } from "@/features/quiz/quiz-editor";
import { QuizEditor } from "@/features/quiz/components/quiz-editor";

export const metadata: Metadata = { title: "Edit quiz" };

export default async function EditQuizPage(props: PageProps<"/teacher/assessments/[quizId]/edit">) {
  await requirePermission({ assessment: ["update"] });
  const { quizId } = await props.params;
  const { tab, view } = await props.searchParams;
  const [detail, classes, bankEntries, sessions] = await Promise.all([
    getQuiz(quizId),
    getClasses(),
    listBank(),
    listSessions({ quizId }),
  ]);
  if (!detail) notFound();
  const bank = bankEntries.map((b) => b.question);

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
