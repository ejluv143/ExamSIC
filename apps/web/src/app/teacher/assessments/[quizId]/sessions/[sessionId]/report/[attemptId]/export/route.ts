import { getAttemptReport } from "@/lib/data/reports";
import { reportWorkbook, xlsxType } from "@/lib/data/workbooks";
import { fileSlug, fullName } from "@/lib/format";

// One student's integrity report as an Excel file (sheets Summary, Timeline, Events, Incidents, Answer history
// and Grade changes).
export async function GET(
  _request: Request,
  ctx: RouteContext<"/teacher/assessments/[quizId]/sessions/[sessionId]/report/[attemptId]/export">,
) {
  const { quizId, sessionId, attemptId } = await ctx.params;
  const report = await getAttemptReport(quizId, sessionId, attemptId);
  if (!report) return new Response("Not found", { status: 404 });
  const file = await reportWorkbook(report);
  const who = report.student ? fullName(report.student) : "student";
  return new Response(file as BodyInit, {
    headers: {
      "Content-Type": xlsxType,
      "Content-Disposition": `attachment; filename="${fileSlug(`${report.quiz.quiz.title} ${who}`)}-integrity-report.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
