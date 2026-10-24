import { modeLabel } from "@examinus/copy/modes";
import { percent } from "@examinus/domain/scoring";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback } from "react";
import { Text, View } from "react-native";
import { formatDateTime } from "@/lib/format";
import { loadResult } from "@/lib/data";
import { useLoad } from "@/lib/use-load";
import { Badge, Button, Card, CardTitle, EmptyState, Loadable, Notice, Row, Screen } from "@/ui/components";

// One submitted attempt: the score, and the questions with points and feedback once the teacher released them.
export default function Result() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const router = useRouter();
  const load = useLoad(useCallback(() => loadResult(sessionId), [sessionId]));
  return (
    <Screen load={load}>
      <Button variant="secondary" onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}>
        ← Back
      </Button>
      <Loadable load={load}>
        {(r) => (
          <>
            <View className="gap-1">
              <Text className="text-2xl font-semibold text-foreground">{r.quiz.title}</Text>
              <View className="flex-row items-center gap-2">
                <Badge tone={r.session.mode === "exam" ? "primary" : "neutral"}>{modeLabel(r.session.mode)}</Badge>
                <Text className="text-sm text-muted">
                  {r.submittedAt ? `Submitted ${formatDateTime(r.submittedAt)}` : "Not submitted"}
                  {r.session.attemptsAllowed !== 1 && ` · attempt ${r.attemptsUsed}`}
                </Text>
              </View>
            </View>
            {r.summary === null ? (
              <Notice tone="info">{r.visible ? "There is no score for this attempt." : "Your teacher hasn't released the results yet."}</Notice>
            ) : (
              <Card className="items-center gap-1 p-6">
                <Text className="text-4xl font-semibold text-foreground">
                  {r.summary.score} <Text className="text-xl font-normal text-muted">/ {r.summary.max}</Text>
                </Text>
                <Text className="text-muted">{percent(r.summary.score, r.summary.max)}%</Text>
                {r.summary.pendingEssays > 0 && <Text className="text-sm text-muted">So far: {r.summary.pendingEssays} answer(s) are still being graded.</Text>}
              </Card>
            )}
            {r.summary !== null && !r.answerKey && <Notice tone="info">The questions and answers come out when you can't take this session again.</Notice>}
            {r.items.length > 0 && (
              <Card>
                <CardTitle>Questions</CardTitle>
                {r.items.map((item, i) => (
                  <Row key={item.question.id}>
                    <View className="flex-1 gap-1">
                      <Text className="text-xs text-muted">
                        {i + 1}. {item.partTitle}
                      </Text>
                      <Text className="text-foreground">{item.question.prompt}</Text>
                      {item.feedback !== "" && <Text className="text-sm text-muted">{item.feedback}</Text>}
                    </View>
                    <Text className="font-semibold text-foreground">
                      {item.points === null ? "Pending" : `${item.points} / ${item.question.points}`}
                    </Text>
                  </Row>
                ))}
              </Card>
            )}
            {r.visible && r.summary !== null && r.items.length === 0 && r.answerKey && <EmptyState title="No questions to show" />}
          </>
        )}
      </Loadable>
    </Screen>
  );
}
