import { bucketOf } from "@examinus/domain/attempts";
import { joinKeyLength, normalizeJoinKey } from "@examinus/domain/join-key";
import { percent } from "@examinus/domain/scoring";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { callResult } from "@/lib/api";
import { loadHome } from "@/lib/data";
import { useUser } from "@/lib/session";
import { useLoad } from "@/lib/use-load";
import { Badge, Button, Card, CardTitle, EmptyState, Field, Loadable, Notice, Screen, StatCard } from "@/ui/components";
import { SessionRow } from "@/ui/session-row";
import { Result } from "effect";

// The 7-character key the teacher shows opens the session: a game takes the student to its lobby, a mastery session to
// the mastery queue, any other session to its paper. Case, spaces and dashes don't matter; a session without a class
// adds the student to it (the list refreshes behind the screen).
function JoinKeyCard({ onJoined }: { onJoined: () => void }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = normalizeJoinKey(code);

  async function join() {
    setBusy(true);
    setError(null);
    try {
      const result = await callResult((api) => api["game.find"]({ code }));
      if (Result.isSuccess(result)) {
        const found = result.success;
        onJoined();
        router.push(found.mode === "game" ? `/game/${found.sessionId}` : found.mode === "mastery" ? `/mastery/${found.sessionId}` : `/take/${found.sessionId}`);
      } else setError(result.failure.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="gap-3 p-4">
      <View>
        <Text className="font-semibold text-foreground">Join with a key</Text>
        <Text className="text-sm text-muted">Enter the {joinKeyLength}-character key your teacher shows.</Text>
      </View>
      <Field
        label="Join key"
        value={code}
        onChangeText={(t) => setCode(t.toUpperCase())}
        onSubmitEditing={() => key !== null && void join()}
        placeholder="ABC-DEFG"
        maxLength={9}
        autoCapitalize="characters"
        autoCorrect={false}
      />
      {error !== null && <Notice tone="danger">{error}</Notice>}
      <Button busy={busy} disabled={key === null} onPress={() => void join()}>
        Join
      </Button>
    </Card>
  );
}

export default function Home() {
  const user = useUser();
  const router = useRouter();
  const load = useLoad(loadHome);

  return (
    <Screen load={load} title={`Hi, ${user.name.split(" ")[0]}`}>
      <Loadable load={load}>
        {({ classes, sessions }) => {
          const todo = sessions.filter((i) => bucketOf(i) === "todo");
          const upcoming = sessions.filter((i) => bucketOf(i) === "upcoming");
          const results = sessions.filter((i) => i.result).sort((x, y) => (y.lastSubmittedAt ?? "").localeCompare(x.lastSubmittedAt ?? ""));
          // Scores with essays still being graded would drag the average down, so they wait.
          const pcts = results.filter((i) => i.result!.pendingEssays === 0).map((i) => percent(i.result!.score, i.result!.max));
          const average = pcts.length ? Math.round(pcts.reduce((n, p) => n + p, 0) / pcts.length) : null;
          return (
            <>
              <View className="flex-row flex-wrap gap-2">
                {classes.map((c) => (
                  <Badge key={c.id}>
                    {c.courseCode} · {c.section}
                  </Badge>
                ))}
              </View>
              <View className="flex-row flex-wrap gap-3">
                <StatCard label="To do" value={todo.length} hint={todo.length ? "open now" : "all caught up"} />
                <StatCard label="Upcoming" value={upcoming.length} />
                <StatCard label="Average score" value={average === null ? "—" : `${average}%`} hint="fully graded results" />
                <StatCard label="Classes" value={classes.length} />
              </View>
              <JoinKeyCard onJoined={() => void load.refresh()} />
              <Card>
                <CardTitle>Open now</CardTitle>
                {todo.length === 0 ? <EmptyState title="Nothing to take right now" /> : todo.map((i) => <SessionRow key={i.session.id} item={i} classes={classes} />)}
              </Card>
              <Card>
                <CardTitle>Coming up</CardTitle>
                {upcoming.length === 0 ? <EmptyState title="Nothing scheduled" /> : upcoming.map((i) => <SessionRow key={i.session.id} item={i} classes={classes} />)}
              </Card>
              <Card>
                <CardTitle
                  action={
                    <Text className="text-sm text-muted" onPress={() => router.push("/results")} accessibilityRole="link">
                      See all →
                    </Text>
                  }
                >
                  Recent results
                </CardTitle>
                {results.length === 0 ? <EmptyState title="No scores released yet" /> : results.slice(0, 3).map((i) => <SessionRow key={i.session.id} item={i} classes={classes} />)}
              </Card>
            </>
          );
        }}
      </Loadable>
    </Screen>
  );
}
