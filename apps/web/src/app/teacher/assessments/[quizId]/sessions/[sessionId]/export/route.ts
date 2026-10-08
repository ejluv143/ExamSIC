import { getResultsExport } from "@/lib/data/reports";
import { resultsWorkbook, xlsxType } from "@/lib/data/workbooks";
import { fileSlug } from "@/lib/format";

// The results of one session as an Excel file: each student's score, integrity level and paper version, then
// the points of every part and question. The API only lets the teacher who owns the session read it.
export async function GET(_request: Request, ctx: RouteContext<"/teacher/assessments/[quizId]/sessions/[sessionId]/export">) {
  const { quizId, sessionId } = await ctx.params;
  const results = await getResultsExport(quizId, sessionId);
  if (!results) return new Response("Not found", { status: 404 });
  const file = await resultsWorkbook(results);
  return new Response(file as BodyInit, {
    headers: {
      "Content-Type": xlsxType,
      "Content-Disposition": `attachment; filename="${fileSlug(results.quiz.quiz.title)}-results.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
