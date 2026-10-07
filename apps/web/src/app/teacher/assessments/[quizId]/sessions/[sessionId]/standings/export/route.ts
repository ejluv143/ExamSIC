import { getGameStandings } from "@/lib/data/game";
import { gameWorkbook, xlsxType } from "@/lib/data/workbooks";
import { fileSlug } from "@/lib/format";

// The final standings of a game as an Excel file. The API only lets the teacher who owns the session read it.
export async function GET(_request: Request, ctx: RouteContext<"/teacher/assessments/[quizId]/sessions/[sessionId]/standings/export">) {
  const { sessionId } = await ctx.params;
  const standings = await getGameStandings(sessionId);
  if (!standings) return new Response("Not found", { status: 404 });
  const file = await gameWorkbook(standings);
  return new Response(file as BodyInit, {
    headers: {
      "Content-Type": xlsxType,
      "Content-Disposition": `attachment; filename="${fileSlug(standings.title)}-standings.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
