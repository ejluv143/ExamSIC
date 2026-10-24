import type { MyResult } from "@examinus/contract/attempt";
import { modeLabel } from "@examinus/copy/modes";
import { attemptLabel, availability, hasAttemptsLeft } from "@examinus/domain/attempts";
import { percent } from "@examinus/domain/scoring";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback } from "react";
import { Text, View } from "react-native";
import { formatDateTime } from "@/lib/format";
import { loadResult } from "@/lib/data";
import { useLoad } from "@/lib/use-load";
import { QuestionReview } from "@/question-kinds/review";
import { useAssetUrls } from "@/taking/use-asset-urls";
import { Badge, Button, Card, EmptyState, Loadable, Notice, Screen } from "@/ui/components";

// One submitted attempt: the score, and the questions with the student's answers, points and feedback once the
// teacher released them.
export default function Result() {
  const { sessionId, submitted } = useLocalSearchParams<{ sessionId: string; submitted?: string }>();
  const router = useRouter();
  const load = useLoad(useCallback(() => loadResult(sessionId), [sessionId]));
  return (
    <Screen load={load}>
      <Button variant="secondary" onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}>
        ← Back
      </Button>
      <Loadable load={load}>{(r) => <ResultBody r={r} justSubmitted={submitted === "1"} />}</Loadable>
    </Screen>
  );
}

function ResultBody({ r, justSubmitted }: { r: MyResult; justSubmitted: boolean }) {
  const router = useRouter();
  const { urls } = useAssetUrls(r.assetUrls);
  const s = r.session;
  const canRetake = availability(s.status) === "open" && hasAttemptsLeft(r.attemptsUsed, s.attemptsAllowed) && s.mode !== "game";
  return (
    <>
      {justSubmitted && r.submittedAt !== null && (
        <Notice tone="success">{s.mode === "exam" ? "Your exam was submitted." : "Your answers were submitted."}</Notice>
      )}
      <View className="gap-1">
        <Text className="text-2xl font-semibold text-foreground">{r.quiz.title}</Text>
        <View className="flex-row items-center gap-2">
          <Badge tone={s.mode === "exam" ? "primary" : "neutral"}>{modeLabel(s.mode)}</Badge>
          <Text className="text-sm text-muted">
            {r.submittedAt ? `Submitted ${formatDateTime(r.submittedAt)}` : "Not submitted"}
            {s.attemptsAllowed !== 1 && r.submittedAt ? ` · ${attemptLabel(r.attemptsUsed, s.attemptsAllowed)}` : ""}
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
      {r.summary !== null && !r.answerKey && <Notice tone="info">The questions and answers come out when you can&apos;t take this session again.</Notice>}
      {canRetake && <Button onPress={() => router.replace(`/take/${s.id}`)}>{r.submittedAt ? "Try again" : "Start"}</Button>}
      {r.items.map((item, i) => (
        <Card key={item.question.id} className="gap-3 p-4">
          <View className="flex-row items-center justify-between gap-2">
            <Text className="text-xs text-muted">
              {i + 1}. {item.partTitle}
            </Text>
            <Text className="font-semibold text-foreground">{item.points === null ? "Pending" : `${item.points} / ${item.question.points}`}</Text>
          </View>
          <QuestionReview question={item.question} answer={item.answer} full={item.points !== null && item.points >= item.question.points} feedback={item.feedback} assetUrls={urls} />
        </Card>
      ))}
      {r.visible && r.summary !== null && r.items.length === 0 && r.answerKey && <EmptyState title="No questions to show" />}
    </>
  );
}
