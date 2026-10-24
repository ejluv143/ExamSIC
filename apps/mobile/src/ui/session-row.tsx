import type { MySessionItem } from "@examinus/contract/attempt";
import { attemptLabel, bucketOf } from "@examinus/domain/attempts";
import { modeLabel } from "@examinus/copy/modes";
import { useRouter } from "expo-router";
import { Linking, Text, View } from "react-native";
import { WEB_URL } from "@/lib/env";
import { formatDateTime } from "@/lib/format";
import { Badge, Button, Row } from "./components";

type ClassInfo = { id: string; courseCode: string; section: string };

const classNames = (item: MySessionItem, classes: readonly ClassInfo[]) =>
  classes.filter((c) => c.id === item.session.classId).map((c) => `${c.courseCode} · ${c.section}`).join(", ");

// The web page that takes a session; the app takes sessions itself from M2 on.
const webPage = (item: MySessionItem) =>
  `${WEB_URL}/student/${item.session.mode === "game" ? "game" : "assessments"}/${item.session.id}`;

// One quiz, exam or game with what the student can do next: take it (on the web for now), wait for it, or see the score.
export function SessionRow({ item, classes }: { item: MySessionItem; classes: readonly ClassInfo[] }) {
  const router = useRouter();
  const bucket = bucketOf(item);
  const s = item.session;
  const where = classNames(item, classes);
  return (
    <Row onPress={bucket === "done" && item.lastSubmittedAt ? () => router.push(`/results/${s.id}`) : undefined}>
      <View className="flex-1 gap-1">
        <View className="flex-row flex-wrap items-center gap-2">
          <Text className="font-medium text-foreground">{item.quizTitle}</Text>
          <Badge tone={s.mode === "exam" ? "primary" : "neutral"}>{modeLabel(s.mode)}</Badge>
        </View>
        <Text className="text-sm text-muted">
          {where !== "" && `${where} · `}
          {bucket === "todo"
            ? `${s.closesAt ? `Closes ${formatDateTime(s.closesAt)}` : "No deadline"}${s.timeLimitMinutes ? ` · ${s.timeLimitMinutes} min` : ""}${s.attemptsAllowed !== 1 ? ` · ${attemptLabel(item.attemptsUsed + (item.inProgress ? 0 : 1), s.attemptsAllowed)}` : ""}`
            : bucket === "upcoming"
              ? `Opens ${formatDateTime(s.opensAt)}${s.timeLimitMinutes ? ` · ${s.timeLimitMinutes} min` : ""} · ${item.questionCount} questions`
              : item.attemptsUsed === 0
                ? "Not submitted"
                : `Submitted ${formatDateTime(item.lastSubmittedAt)}`}
        </Text>
        {bucket === "todo" && s.mode === "exam" && <Text className="text-xs text-muted">Exams need a device check and the honor pledge before you start.</Text>}
        {bucket === "todo" && (
          <View className="mt-1">
            <Button variant="secondary" onPress={() => void Linking.openURL(webPage(item))}>
              Open on the web
            </Button>
          </View>
        )}
      </View>
      {bucket === "done" && item.lastSubmittedAt && (
        <Text className="font-semibold text-foreground">
          {item.result ? `${item.result.score} / ${item.result.max}` : "Score not out yet"}
        </Text>
      )}
    </Row>
  );
}
