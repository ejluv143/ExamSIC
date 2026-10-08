import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GamePresenter } from "@/components/game-presenter";
import { quizQuestions } from "@/lib/attempt-view";
import { getSession } from "@/lib/data/teacher";

export const metadata: Metadata = { title: "Game" };

// The projector screen of a game.
export default async function PresentGamePage(props: PageProps<"/teacher/assessments/[quizId]/sessions/[sessionId]/present">) {
  const { quizId, sessionId } = await props.params;
  const detail = await getSession(sessionId);
  if (!detail || detail.session.quizId !== quizId || detail.session.mode !== "game") notFound();
  const base = `/teacher/assessments/${quizId}/sessions/${sessionId}`;
  const drawingQuestions = quizQuestions(detail.quiz).flatMap((q, i) =>
    q.type === "drawing" ? [{ id: q.id, number: i + 1, prompt: q.prompt }] : [],
  );
  return <GamePresenter sessionId={sessionId} backHref={base} exportHref={`${base}/standings/export`} drawingQuestions={drawingQuestions} />;
}
