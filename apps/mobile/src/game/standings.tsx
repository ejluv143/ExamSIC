// A finished game's full standings (`game.standings`): ranks, points, correct answers and average time; Team Relay adds
// the teams and the most missed questions (the web's `GameStandingsTable` as lists).
import { useCallback } from "react";
import { Text, View } from "react-native";
import { callApi } from "@/lib/api";
import { useLoad } from "@/lib/use-load";
import { Card, CardTitle, Loadable } from "@/ui/components";
import { AvatarImage } from "./avatar";

// Minutes and seconds from the start to the solve, e.g. "4:07".
const solveTime = (ms: number) => {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

export function GameStandingsList({ sessionId }: { sessionId: string }) {
  const load = useLoad(useCallback(() => callApi((api) => api["game.standings"]({ sessionId })), [sessionId]));
  return (
    <Loadable load={load}>
      {(s) => {
        const relay = s.teams.length > 0;
        return (
          <View className="w-full gap-4">
            {relay && (
              <Card>
                <CardTitle>Teams</CardTitle>
                {s.teams.map((t) => (
                  <View key={t.name} className="gap-0.5 border-b border-border px-4 py-3">
                    <View className="flex-row items-center gap-3">
                      <Text className="w-6 font-semibold text-foreground">{t.rank}</Text>
                      <Text className="flex-1 font-medium text-foreground">{t.name}</Text>
                      <Text className="font-semibold text-foreground">{t.points.toLocaleString()}</Text>
                    </View>
                    <Text className="text-xs text-muted">{t.members.join(", ")}</Text>
                    <Text className="text-xs text-muted">
                      {t.solvedMs === null ? "Not solved" : `Solved in ${solveTime(t.solvedMs)}`} · {t.wrongGuesses} wrong guesses · {t.unlocked}/{t.pieces} pieces · password {t.password}
                    </Text>
                  </View>
                ))}
              </Card>
            )}
            <Card>
              <CardTitle>Players</CardTitle>
              {s.standings.map((p) => (
                <View key={p.attemptId} className={`flex-row items-center gap-3 border-b border-border px-4 py-3 ${p.attemptId === s.myAttemptId ? "bg-primary-soft" : ""}`}>
                  <Text className="w-6 font-semibold text-foreground">{p.rank}</Text>
                  <AvatarImage avatar={p.avatar} size={28} />
                  <View className="flex-1">
                    <Text className="font-medium text-foreground" numberOfLines={1}>
                      {p.name}
                    </Text>
                    <Text className="text-xs text-muted">
                      {relay && p.team ? `${p.team} · ` : ""}
                      {p.correct}/{s.questionCount} correct{p.averageMs === null ? "" : ` · ${(p.averageMs / 1000).toFixed(1)} s`}
                      {relay ? ` · ${p.rescues} rescues` : ""}
                    </Text>
                  </View>
                  <Text className="font-semibold text-foreground">{p.points.toLocaleString()}</Text>
                </View>
              ))}
            </Card>
            {relay && s.missed.length > 0 && (
              <Card>
                <CardTitle>Most missed questions</CardTitle>
                {s.missed.map((m) => (
                  <View key={m.questionId} className="flex-row gap-3 border-b border-border px-4 py-3">
                    <Text className="flex-1 text-sm text-foreground">{m.prompt}</Text>
                    <Text className="text-sm text-muted">
                      {m.wrong} / {m.answered} wrong
                    </Text>
                  </View>
                ))}
              </Card>
            )}
          </View>
        );
      }}
    </Loadable>
  );
}
