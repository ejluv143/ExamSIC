import clsx from "clsx";
import type { GameStandings } from "@examinus/contract/game";
import { AvatarImage } from "@/components/avatar";
import { Card, Table, Td, Th } from "@/components/ui";

// The final standings of a game: rank, points, correct answers and the average time to answer. A Team Relay game
// adds each player's team and rescues, the teams table and the questions most often answered wrong.
export function GameStandingsTable({ standings, meId }: { standings: GameStandings; meId?: string | null }) {
  const relay = standings.teams.length > 0;
  return (
    <div className="space-y-6">
      {relay && (
        <Card className="overflow-hidden">
          <Table>
            <thead>
              <tr>
                <Th className="w-16">Rank</Th>
                <Th>Team</Th>
                <Th>Members</Th>
                <Th className="text-right">Points</Th>
                <Th className="text-right">Solve time</Th>
                <Th className="text-right">Wrong guesses</Th>
                <Th className="text-right">Pieces</Th>
                <Th>Password</Th>
              </tr>
            </thead>
            <tbody>
              {standings.teams.map((t) => (
                <tr key={t.name}>
                  <Td className="tabular-nums font-semibold">{t.rank}</Td>
                  <Td className="font-medium">{t.name}</Td>
                  <Td>{t.members.join(", ")}</Td>
                  <Td className="text-right font-semibold tabular-nums">{t.points.toLocaleString()}</Td>
                  <Td className="text-right tabular-nums">{t.solvedMs === null ? "Not solved" : formatSolveTime(t.solvedMs)}</Td>
                  <Td className="text-right tabular-nums">{t.wrongGuesses}</Td>
                  <Td className="text-right tabular-nums">
                    {t.unlocked} / {t.pieces}
                  </Td>
                  <Td className="font-mono text-sm">{t.password}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
      <Card className="overflow-hidden">
        <Table>
          <thead>
            <tr>
              <Th className="w-16">Rank</Th>
              <Th>Player</Th>
              {relay && <Th>Team</Th>}
              <Th className="text-right">Points</Th>
              <Th className="text-right">Correct</Th>
              <Th className="text-right">Avg. time</Th>
              {relay && <Th className="text-right">Rescues</Th>}
            </tr>
          </thead>
          <tbody>
            {standings.standings.map((s) => (
              <tr key={s.attemptId} className={clsx(s.attemptId === meId && "bg-primary-soft")}>
                <Td className="tabular-nums font-semibold">{s.rank}</Td>
                <Td>
                  <span className="flex items-center gap-2">
                    <AvatarImage avatar={s.avatar} size={28} />
                    {s.name}
                  </span>
                </Td>
                {relay && <Td>{s.team ?? "—"}</Td>}
                <Td className="text-right font-semibold tabular-nums">{s.points.toLocaleString()}</Td>
                <Td className="text-right tabular-nums">
                  {s.correct} / {standings.questionCount}
                </Td>
                <Td className="text-right tabular-nums">{s.averageMs === null ? "—" : `${(s.averageMs / 1000).toFixed(1)} s`}</Td>
                {relay && <Td className="text-right tabular-nums">{s.rescues}</Td>}
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
      {relay && standings.missed.length > 0 && (
        <section aria-labelledby="missed-heading">
          <h3 id="missed-heading" className="mb-2 font-semibold">
            Most missed questions
          </h3>
          <Card className="overflow-hidden">
            <Table>
              <thead>
                <tr>
                  <Th>Question</Th>
                  <Th className="text-right">Wrong</Th>
                  <Th className="text-right">Answered</Th>
                </tr>
              </thead>
              <tbody>
                {standings.missed.map((m) => (
                  <tr key={m.questionId}>
                    <Td>{m.prompt}</Td>
                    <Td className="text-right tabular-nums">{m.wrong}</Td>
                    <Td className="text-right tabular-nums">{m.answered}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        </section>
      )}
    </div>
  );
}

// Minutes and seconds from the start to the solve, e.g. "4:07".
function formatSolveTime(ms: number) {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
