import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/ui";
import { getMyResult } from "@/lib/data/student";
import { analyzeAttempt, resultTelemetry, topicTags } from "@examinus/domain/analytics";
import { toStudentQuestion } from "@examinus/domain/question";
import { practiceTypes } from "@/components/session-report/format";
import { PracticeSession, type PracticeItem } from "./practice-session";

export const metadata: Metadata = { title: "Practice" };

export default async function PracticePage(props: PageProps<"/student/assessments/[sessionId]/practice">) {
  const { sessionId } = await props.params;
  const { scope, topic } = await props.searchParams;
  const r = await getMyResult(sessionId);
  if (!r || !r.summary || r.items.length === 0 || (r.session.mode === "exam" && !r.visible)) notFound();
  const topicName = typeof topic === "string" && topic !== "" ? topic : null;
  const analytics = analyzeAttempt(resultTelemetry(r, r.userId));
  const items: PracticeItem[] = r.items.flatMap(({ question: q }, i) => {
    if (!practiceTypes.has(q.type)) return [];
    const outcome = analytics.questions[i]!.outcome;
    const wanted = topicName !== null ? topicTags(q.topic).includes(topicName) : scope === "missed" && (outcome === "incorrect" || outcome === "skipped");
    return wanted ? [{ question: q, student: toStudentQuestion(q) }] : [];
  });

  const resultHref = `/student/assessments/${sessionId}/result`;
  const heading = topicName !== null ? `Practice: ${topicName}` : "Practice missed questions";

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href={resultHref} className="inline-block text-sm text-muted hover:text-foreground">
        ← Back to result
      </Link>
      <div>
        <h1 className="text-xl font-semibold">{heading}</h1>
        <p className="mt-1 text-sm text-muted">{r.quiz.title}. Nothing here is saved or graded; it is only for practice.</p>
      </div>
      {items.length === 0 ? (
        <EmptyState title="Nothing to practise here">
          No question of this attempt qualifies. Essays, drawings, code and SQL can&apos;t be practised this way.
        </EmptyState>
      ) : (
        <PracticeSession items={items} assetUrls={r.assetUrls} resultHref={resultHref} />
      )}
    </div>
  );
}
