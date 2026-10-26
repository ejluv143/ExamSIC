import { percent } from "@examinus/domain/scoring";
import { modeLabel } from "@examinus/copy/modes";
import { useRouter } from "expo-router";
import { Text, View } from "react-native";
import { formatDate } from "@/lib/format";
import { loadHome } from "@/lib/data";
import { useLoad } from "@/lib/use-load";
import { Badge, Card, CardTitle, EmptyState, Loadable, Row, Screen } from "@/ui/components";

// Every quiz and exam the student submitted, by class, as on the web's Scores page.
export default function Results() {
  const router = useRouter();
  const load = useLoad(loadHome);
  return (
    <Screen load={load} title="Scores" description="Your scores on quizzes and exams. Teachers may release some scores later.">
      <Loadable load={load}>
        {({ classes, sessions }) => {
          const submitted = sessions.filter((i) => i.lastSubmittedAt);
          return (
            <>
              {classes.map((c) => {
                const rows = submitted.filter((i) => i.session.classId === c.id);
                // Only fully graded scores count; one with an essay still waiting would look too low.
                const pcts = rows.flatMap((i) => (i.result && i.result.pendingEssays === 0 ? [percent(i.result.score, i.result.max)] : []));
                const average = pcts.length ? Math.round(pcts.reduce((n, p) => n + p, 0) / pcts.length) : null;
                return (
                  <Card key={c.id}>
                    <CardTitle action={<Text className="text-sm text-muted">Average {average === null ? "—" : `${average}%`}</Text>}>
                      {c.courseCode} · {c.section}
                    </CardTitle>
                    {rows.length === 0 ? (
                      <EmptyState title="Nothing submitted yet" />
                    ) : (
                      rows.map((i) => (
                        <Row key={i.session.id} onPress={() => router.push(`/results/${i.session.id}`)}>
                          <View className="flex-1 gap-1">
                            <Text className="font-medium text-foreground">{i.quizTitle}</Text>
                            <View className="flex-row items-center gap-2">
                              <Badge tone={i.session.mode === "exam" ? "primary" : "neutral"}>{modeLabel(i.session.mode)}</Badge>
                              <Text className="text-xs text-muted">{formatDate(i.lastSubmittedAt)}</Text>
                            </View>
                          </View>
                          <Text className="font-semibold text-foreground">{i.result ? `${i.result.score} / ${i.result.max}` : "Not released"}</Text>
                        </Row>
                      ))
                    )}
                  </Card>
                );
              })}
            </>
          );
        }}
      </Loadable>
    </Screen>
  );
}
