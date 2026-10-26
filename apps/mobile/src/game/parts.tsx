// The pieces the game screens share: the countdown bar, the standings, the podiums and the team debrief. They mirror
// the web's `game-parts.tsx` and `relay-parts.tsx`; only the animation is simpler.
import type { GameRow, RelayDebriefItem, RelayTeamSummary } from "@examinus/contract/game";
import { Text, View } from "react-native";
import { AvatarImage } from "./avatar";
import { formatClock } from "./use-game";

// The colour of the Nth answer, the same on the projector and on the phones (the web's `choiceStyles`), with the
// text colour that reads on it (React Native text doesn't inherit a colour from its button).
export const choiceStyles = [
  { tile: "bg-red-600", text: "#ffffff" },
  { tile: "bg-blue-600", text: "#ffffff" },
  { tile: "bg-amber-500", text: "#020617" },
  { tile: "bg-emerald-600", text: "#ffffff" },
  { tile: "bg-violet-600", text: "#ffffff" },
  { tile: "bg-pink-600", text: "#ffffff" },
] as const;

export function CountdownBar({ remainingMs, totalSeconds }: { remainingMs: number | null; totalSeconds: number }) {
  if (remainingMs === null) return null;
  const share = Math.min(1, remainingMs / (totalSeconds * 1000));
  const seconds = Math.ceil(remainingMs / 1000);
  return (
    <View className="flex-row items-center gap-3" accessibilityRole="timer" accessibilityLabel={`${seconds} seconds left`}>
      <View className="h-3 flex-1 overflow-hidden rounded-full bg-surface-muted">
        <View className={`h-full rounded-full ${share < 0.25 ? "bg-red-500" : "bg-emerald-500"}`} style={{ width: `${share * 100}%` }} />
      </View>
      <Text className={`w-10 text-right text-2xl font-bold ${seconds > 0 && seconds <= 5 ? "text-red-500" : "text-foreground"}`}>{seconds}</Text>
    </View>
  );
}

// The standings; the player's own row is outlined.
export function Leaderboard({ rows, meId }: { rows: readonly GameRow[]; meId?: string | null }) {
  return (
    <View className="gap-2" accessibilityLabel="Leaderboard">
      {rows.map((row) => (
        <View
          key={row.attemptId}
          className={`flex-row items-center gap-3 rounded-lg border bg-surface px-3 py-2 ${row.attemptId === meId ? "border-primary" : "border-border"}`}
          style={row.attemptId === meId ? { borderWidth: 2 } : undefined}
        >
          <Text className="w-7 text-right font-bold text-foreground opacity-70">{row.rank}</Text>
          <AvatarImage avatar={row.avatar} size={36} />
          <Text className="flex-1 font-medium text-foreground" numberOfLines={1}>
            {row.name}
          </Text>
          <Text className="font-bold text-foreground">{row.points.toLocaleString()}</Text>
        </View>
      ))}
    </View>
  );
}

const medals = ["bg-slate-300", "bg-amber-400", "bg-orange-400"];
const heights = [112, 160, 80];

// The top three, second, first, third.
export function Podium({ rows }: { rows: readonly GameRow[] }) {
  const places = [rows[1], rows[0], rows[2]];
  return (
    <View className="flex-row items-end justify-center gap-2" accessibilityLabel="Podium">
      {places.map((row, i) =>
        row ? (
          <View key={row.attemptId} className="flex-1 items-center">
            <AvatarImage avatar={row.avatar} size={i === 1 ? 64 : 48} />
            <Text className="mt-1 max-w-full font-semibold text-foreground" numberOfLines={1}>
              {row.name}
            </Text>
            <Text className="text-sm text-muted">{row.points.toLocaleString()}</Text>
            <View className={`mt-2 w-full items-center rounded-t-lg pt-2 ${medals[i]}`} style={{ height: heights[i] }}>
              <Text className="text-3xl font-black text-slate-900">{row.rank}</Text>
            </View>
          </View>
        ) : (
          <View key={i} className="flex-1" />
        ),
      )}
    </View>
  );
}

// Teams best first: by rank (the server's order: solved by time, then points), then by name.
export const rankedTeams = (teams: readonly RelayTeamSummary[]) =>
  [...teams].sort((a, b) => (a.rank || Infinity) - (b.rank || Infinity) || a.name.localeCompare(b.name));

// How a team's round stands, in words (never by colour alone).
export function teamStatus(team: RelayTeamSummary, roundOver: boolean): string {
  if (team.solvedAt) return "Solved";
  if (team.finished) return roundOver ? "Time's up" : "Out of guesses";
  return "Playing";
}

export function TeamPodium({ teams }: { teams: readonly RelayTeamSummary[] }) {
  const ranked = rankedTeams(teams).slice(0, 3);
  const places = [ranked[1], ranked[0], ranked[2]];
  const h = [96, 144, 64];
  return (
    <View className="flex-row items-end justify-center gap-2" accessibilityLabel="Team podium">
      {places.map((team, i) =>
        team ? (
          <View key={team.id} className="flex-1 items-center">
            <Text className="max-w-full text-lg font-semibold text-foreground" numberOfLines={1}>
              {team.name}
            </Text>
            <Text className="text-sm text-muted">{team.points.toLocaleString()} points</Text>
            <Text className="max-w-full text-xs text-muted" numberOfLines={1}>
              {team.members.map((m) => m.name).join(", ")}
            </Text>
            <View className={`mt-2 w-full items-center rounded-t-lg pt-2 ${medals[i]}`} style={{ height: h[i] }}>
              <Text className="text-3xl font-black text-slate-900">{i === 1 ? 1 : i === 0 ? 2 : 3}</Text>
            </View>
          </View>
        ) : (
          <View key={i} className="flex-1" />
        ),
      )}
    </View>
  );
}

// The round clock; ticking text, shown only while the round runs.
export function RoundClock({ ms }: { ms: number | null }) {
  if (ms === null) return null;
  return (
    <Text className="text-sm text-muted">
      Round time left: <Text className="font-semibold text-foreground">{ms === 0 ? "time's up" : formatClock(ms)}</Text>
    </Text>
  );
}

// One team's questions after its round: who had which, what they answered, the right answer and why.
export function Debrief({ items }: { items: readonly RelayDebriefItem[] }) {
  return (
    <View className="gap-3">
      {items.map((item, i) => (
        <View key={item.questionId} className="rounded-xl border border-border bg-surface p-4">
          <Text className="text-xs text-muted">
            Question {i + 1} · {item.owner ? `${item.owner}'s question` : "no owner"}
          </Text>
          <Text className="mt-1 font-semibold text-foreground">{item.prompt}</Text>
          {item.answer === null ? (
            <Text className="mt-2 text-sm text-muted">Not answered: they never got to it.</Text>
          ) : (
            <Text className="mt-2 text-sm text-foreground">
              {item.owner || "They"} answered: <Text className="font-medium">{item.answer === "" ? "(blank)" : item.answer}</Text>
              {item.correct === true && <Text className="font-semibold text-emerald-600">{"  ✓ Right"}</Text>}
              {item.correct === false && <Text className="font-semibold text-red-600">{"  ✗ Wrong"}</Text>}
            </Text>
          )}
          <Text className="mt-1 text-sm text-foreground">
            Correct answer: <Text className="font-medium">{item.correctAnswer || "(not shown)"}</Text>
          </Text>
          {item.explanation ? <Text className="mt-1 text-sm text-muted">{item.explanation}</Text> : null}
          {(item.retries > 0 || item.rescuedBy) && (
            <Text className="mt-1 text-sm text-muted">
              {item.retries > 0 && `Retries: ${item.retries}. `}
              {item.rescuedBy && `Rescued by ${item.rescuedBy}${item.rescueCorrect === null ? "" : item.rescueCorrect ? " (right)" : " (wrong)"}.`}
            </Text>
          )}
        </View>
      ))}
    </View>
  );
}
