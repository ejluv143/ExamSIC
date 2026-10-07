import type { Metadata } from "next";
import { notFound } from "next/navigation";
import clsx from "clsx";
import { Badge, Card, PageHeader } from "@/components/ui";
import { getAssessment, getStudents, getSubmissions } from "@/lib/data/teacher";
import { fullName } from "@/lib/format";
import { matchingLines, similarPairs, sourceKind } from "@/lib/similarity";

export const metadata: Metadata = { title: "Compare answers" };

// Two students' answers to one code question side by side, with lines that match (after renaming) highlighted.
export default async function ComparePage(props: PageProps<"/teacher/assessments/[assessmentId]/integrity/compare">) {
  const { assessmentId } = await props.params;
  const { q: questionId, a: subA, b: subB } = await props.searchParams;
  const a = await getAssessment(assessmentId);
  const q = a?.questions.find((x) => x.id === questionId);
  if (!a || q?.type !== "code") notFound();

  const subs = await getSubmissions(a.id);
  const pair = [subA, subB].map((id) => subs.find((s) => s.id === id));
  if (!pair[0] || !pair[1]) notFound();
  const students = await getStudents(pair.map((s) => s!.studentId));
  const texts = pair.map((s) => (typeof s!.answers[q.id] === "string" ? (s!.answers[q.id] as string) : ""));
  const kind = sourceKind(q.language);
  const score = similarPairs(
    texts.map((text, i) => ({ id: String(i), text })),
    q.starterCode,
    kind,
    0,
  )[0]?.score;

  return (
    <>
      <PageHeader
        back={{ href: `/teacher/assessments/${a.id}/integrity`, label: "Anti-cheating" }}
        title="Compare answers"
        description={
          <span className="flex flex-wrap items-center gap-2">
            Question {a.questions.indexOf(q) + 1}
            {score !== undefined && (
              <Badge tone={score >= 0.85 ? "danger" : "warning"}>{Math.round(score * 100)}% similar</Badge>
            )}
            Highlighted lines match the other answer once names, numbers and spacing are ignored.
          </span>
        }
      />
      <div className="grid gap-4 lg:grid-cols-2">
        {pair.map((sub, i) => {
          const student = students.find((s) => s.id === sub!.studentId);
          const same = matchingLines(texts[i], texts[1 - i], q.starterCode, kind);
          const lines = texts[i].split("\n");
          return (
            <Card key={sub!.id} className="min-w-0 overflow-hidden">
              <div className="border-b border-border px-4 py-3">
                <p className="font-medium">{student ? fullName(student) : "Unknown student"}</p>
                <p className="font-mono text-xs text-muted">
                  {student?.studentNumber} · {same.size} of {lines.filter((l) => l.trim()).length} lines match
                </p>
              </div>
              <pre className="overflow-x-auto py-2 font-mono text-xs leading-relaxed">
                {lines.map((line, n) => (
                  <div key={n} className={clsx("flex", same.has(n) && "bg-danger-soft")}>
                    <span className="w-10 shrink-0 pr-3 text-right text-muted select-none">{n + 1}</span>
                    <code className="pr-4">{line || " "}</code>
                  </div>
                ))}
              </pre>
            </Card>
          );
        })}
      </div>
    </>
  );
}
