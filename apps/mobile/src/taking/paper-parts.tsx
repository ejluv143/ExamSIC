// The pieces of the paper screen: the bar on top, the question overview (a sheet), the review list before
// submitting, the mark toggle and the intro.
import type { Paper } from "@examinus/contract/attempt";
import { attemptLabel } from "@examinus/domain/attempts";
import { integrityRules } from "@examinus/domain/integrity";
import type { NavItem } from "@examinus/taking/nav-items";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Modal } from "@/ui/modal";
import { Markdown } from "@/markdown/markdown";
import { formatDateTime } from "@/lib/format";
import { Button, Card, Notice } from "@/ui/components";
import { useColors } from "@/ui/theme";

// "12 answered · 3 marked · 5 left"
export function countsText(items: readonly NavItem[], marking: boolean): string {
  const answered = items.filter((i) => i.answered).length;
  return [`${answered} answered`, marking && `${items.filter((i) => i.marked).length} marked`, `${items.length - answered} left`].filter(Boolean).join(" · ");
}

export const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

export function ExamHeader({
  title,
  items,
  marking,
  answered,
  position,
  onOpenSheet,
  saveState,
  secondsLeft,
  qSecondsLeft,
}: {
  title: string;
  items: readonly NavItem[];
  marking: boolean;
  answered: number;
  position: string;
  onOpenSheet: () => void;
  saveState: "idle" | "saving" | "saved" | "error";
  secondsLeft: number | null;
  qSecondsLeft: number | null;
}) {
  return (
    <View className="gap-2 border-b border-border bg-surface px-4 py-3">
      <View className="flex-row items-center gap-3">
        <Text className="min-w-0 flex-1 font-semibold text-foreground" numberOfLines={1}>
          {title || "Untitled"}
        </Text>
        {saveState !== "idle" && (
          <Text accessibilityLiveRegion="polite" className={`text-xs ${saveState === "error" ? "text-danger" : "text-muted"}`}>
            {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : "Not saved, check your connection"}
          </Text>
        )}
        {secondsLeft !== null && (
          <View className={`rounded-md px-2 py-1 ${secondsLeft < 300 ? "bg-danger-soft" : "bg-surface-muted"}`}>
            <Text className={`text-sm font-medium ${secondsLeft < 300 ? "text-danger" : "text-foreground"}`}>⏱ {clock(secondsLeft)}</Text>
          </View>
        )}
      </View>
      <View className="flex-row items-center gap-3">
        <View className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-muted">
          <View className="h-full rounded-full bg-primary" style={{ width: `${(answered / Math.max(1, items.length)) * 100}%` }} />
        </View>
        <Text className="text-xs text-muted">
          {position}
          {countsText(items, marking)}
        </Text>
      </View>
      <View className="flex-row items-center justify-between">
        <Pressable accessibilityRole="button" onPress={onOpenSheet} className="rounded-md border border-border px-3 py-1.5 active:bg-surface-muted">
          <Text className="text-xs font-medium text-foreground">▦ Questions</Text>
        </Pressable>
        {qSecondsLeft !== null && (
          <View className={`rounded-md px-2 py-0.5 ${qSecondsLeft < 10 ? "bg-danger-soft" : "bg-surface-muted"}`} accessibilityLabel="Time left for this question">
            <Text className={`text-xs font-medium ${qSecondsLeft < 10 ? "text-danger" : "text-foreground"}`}>⏱ {qSecondsLeft}s</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const tileLabel = (item: NavItem) =>
  [`Question ${item.number}`, item.closed ? "time ran out" : item.answered ? "answered" : "not answered", item.marked && "marked for review", item.current && "you're on it"]
    .filter(Boolean)
    .join(", ");

// Every question as a numbered tile: answered, not answered, marked for review, the one the student is on.
export function QuestionOverview({ items, marking, onOpen, onReview }: { items: readonly NavItem[]; marking: boolean; onOpen: (item: NavItem) => void; onReview: () => void }) {
  return (
    <View className="gap-3">
      <Text className="text-sm font-medium text-foreground">{countsText(items, marking)}</Text>
      <View className="flex-row flex-wrap gap-2">
        {items.map((item) => (
          <Pressable
            key={item.questionId}
            accessibilityRole="button"
            accessibilityLabel={tileLabel(item)}
            onPress={() => onOpen(item)}
            className={`h-11 w-11 items-center justify-center rounded-md border ${
              item.closed ? "border-border bg-surface-muted" : item.answered ? "border-primary bg-primary-soft" : "border-dashed border-muted bg-surface"
            } ${item.marked ? "border-warning" : ""} ${item.current ? "border-2 border-primary" : ""} ${item.blocked !== null ? "opacity-50" : ""}`}
          >
            <Text className={`text-sm font-semibold ${item.answered ? "text-primary" : item.closed ? "text-muted" : "text-foreground"}`}>{item.number}</Text>
            {item.marked && <Text className="absolute -right-1 -top-2 text-xs text-warning">⚑</Text>}
            {item.closed && <Text className="absolute bottom-0 right-0.5 text-[10px] text-muted">🔒</Text>}
          </Pressable>
        ))}
      </View>
      <Text className="text-xs text-muted">
        ✓ Answered · Dashed: not answered{marking ? " · ⚑ Marked" : ""}
        {items.some((i) => i.closed) ? " · 🔒 Time ran out" : ""}
      </Text>
      <Button variant="secondary" onPress={onReview}>
        Review answers
      </Button>
    </View>
  );
}

export function OverviewSheet({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 justify-end bg-black/40" onPress={onClose}>
        <Pressable className="max-h-[80%] rounded-t-2xl border-t border-border bg-surface p-4" onPress={() => undefined}>
          <View className="mb-3 flex-row items-center justify-between">
            <Text className="font-semibold text-foreground" accessibilityRole="header">
              All questions
            </Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} className="rounded-md px-2 py-1">
              <Text className="text-lg text-foreground">✕</Text>
            </Pressable>
          </View>
          <ScrollView>{children}</ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function MarkToggle({ marked, busy, onToggle }: { marked: boolean; busy: boolean; onToggle: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: marked, disabled: busy }}
      disabled={busy}
      onPress={onToggle}
      className={`rounded-md border px-2.5 py-1 ${marked ? "border-warning bg-warning-soft" : "border-border"} ${busy ? "opacity-50" : ""}`}
    >
      <Text className={`text-xs font-medium ${marked ? "text-warning" : "text-muted"}`}>{marked ? "⚑ Marked for review" : "⚐ Mark for review"}</Text>
    </Pressable>
  );
}

// Before submitting: every question with its answer in a few words, the marked ones first.
export function ReviewScreen({
  items,
  marking,
  notice,
  onOpen,
  onBack,
  children,
}: {
  items: readonly NavItem[];
  marking: boolean;
  notice: string | null;
  onOpen: (item: NavItem) => void;
  onBack: () => void;
  children: React.ReactNode;
}) {
  const marked = items.filter((i) => i.marked);
  const others = items.filter((i) => !i.marked);
  const list = (rows: readonly NavItem[]) => (
    <View className="gap-2">
      {rows.map((item) => (
        <View key={item.questionId} className={`flex-row items-center gap-3 rounded-lg border px-3 py-2 ${item.marked ? "border-warning bg-warning-soft" : "border-border"}`}>
          <View className="h-7 w-7 items-center justify-center rounded-md bg-surface-muted">
            <Text className="font-semibold text-foreground">{item.number}</Text>
          </View>
          <View className="min-w-0 flex-1">
            {item.marked && <Text className="text-xs font-medium text-warning">⚑ Marked</Text>}
            {item.summary !== null ? (
              <Markdown inline small>
                {item.summary}
              </Markdown>
            ) : (
              <Text className="text-sm italic text-muted">Not answered</Text>
            )}
            {item.closed && <Text className="text-xs text-muted">Time ran out</Text>}
          </View>
          {!item.current && !item.closed && (
            <Pressable accessibilityRole="button" onPress={() => onOpen(item)} className={item.blocked !== null ? "opacity-50" : ""}>
              <Text className="text-sm font-medium text-primary">Go to {item.number}</Text>
            </Pressable>
          )}
          {item.current && <Text className="text-xs text-muted">You&apos;re here</Text>}
        </View>
      ))}
    </View>
  );
  return (
    <Card className="gap-5 p-5">
      <View className="gap-1">
        <Text className="text-lg font-semibold text-foreground">Review your answers</Text>
        <Text className="text-sm text-muted">{countsText(items, marking)}</Text>
      </View>
      <Button variant="secondary" onPress={onBack}>
        ← Back to the questions
      </Button>
      {notice !== null && <Notice tone="warning">{notice}</Notice>}
      {marking && (
        <View className="gap-2">
          <Text className="font-semibold text-foreground">Marked for review ({marked.length})</Text>
          {marked.length > 0 ? list(marked) : <Text className="text-sm text-muted">You haven&apos;t marked any question.</Text>}
        </View>
      )}
      <View className="gap-2">
        <Text className="font-semibold text-foreground">
          {marking ? "Other questions" : "All questions"} ({others.length})
        </Text>
        {list(others)}
      </View>
      {children}
    </Card>
  );
}

// What the student reads before pressing Start: the numbers, the rules and, when there is one, the room password.
export function IntroScreen({
  paper,
  kind,
  assetUrls,
  roomPassword,
  onRoomPassword,
  startError,
  starting,
  onStart,
}: {
  paper: Paper;
  kind: string;
  assetUrls: Readonly<Record<string, string>>;
  roomPassword: string;
  onRoomPassword: (v: string) => void;
  startError: string | null;
  starting: boolean;
  onStart: () => void;
}) {
  const colors = useColors();
  const { session, quiz } = paper;
  const limit = session.timeLimitMinutes;
  const navigationRule = session.oneQuestionAtATime
    ? {
        free: "Questions come one at a time, and you can go back to any of them.",
        marked_only: "Questions come one at a time. Once you move on, you can only come back to questions you marked for review.",
        forward_only: "Questions come one at a time, and you can't go back to a question once you move on.",
      }[session.navigation]
    : null;
  const rules = [
    ...integrityRules(session.integrity, kind),
    navigationRule,
    session.oneQuestionAtATime && session.questionTimeLimitSeconds !== null && `Each question has ${session.questionTimeLimitSeconds} seconds. A question whose time runs out can't be opened again, even if it's marked for review.`,
    session.maxMarked !== null && session.maxMarked > 0 && `You can mark up to ${session.maxMarked} ${session.maxMarked === 1 ? "question" : "questions"} for review at a time.`,
    session.ipRestricted && "It can only be taken on the school network.",
    session.lateJoinMinutes !== null && `You can only start in the first ${session.lateJoinMinutes} minutes.`,
  ].filter((x): x is string => typeof x === "string" && x !== "");
  const retakes = session.attemptsAllowed === null ? "Unlimited" : session.attemptsAllowed - 1 || "None";
  return (
    <Card>
      <View className="gap-1 border-b border-border bg-primary-soft px-5 py-4">
        <Text className="text-xs font-semibold uppercase text-primary">{quiz.header.school}</Text>
        <Text className="text-xl font-semibold text-foreground">{quiz.title || "Untitled"}</Text>
      </View>
      <View className="gap-4 p-5">
        <View className="flex-row flex-wrap gap-2">
          {[
            ["Questions", paper.questionCount],
            ["Points", Math.round(paper.totalPoints * 100) / 100],
            ["Time limit", limit ? `${limit} min` : "None"],
            ["Retakes", retakes],
          ].map(([k, v]) => (
            <View key={String(k)} className="min-w-[45%] flex-1 rounded-lg bg-surface-muted px-3 py-2">
              <Text className="text-xs text-muted">{k}</Text>
              <Text className="font-semibold text-foreground">{v}</Text>
            </View>
          ))}
        </View>
        {session.closesAt !== null && <Text className="text-sm text-muted">Closes {formatDateTime(session.closesAt)}.</Text>}
        {quiz.description !== "" && <Markdown small assetUrls={assetUrls}>{quiz.description}</Markdown>}
        {rules.length > 0 && (
          <View className="gap-1 rounded-lg bg-warning-soft p-3">
            <Text className="font-medium text-warning">Rules</Text>
            {rules.map((r) => (
              <Text key={r} className="text-sm text-warning">
                • {r}
              </Text>
            ))}
          </View>
        )}
        <Text className="text-sm text-muted">
          {session.attemptsAllowed === 1 ? `You can take this ${kind} once; there are no retakes.` : `This is ${attemptLabel(paper.attemptsUsed + 1, session.attemptsAllowed)}.`}
          {limit !== null && " The timer starts when you press Start and keeps running if you leave the app."}
        </Text>
        {session.roomPasswordRequired && (
          <View className="gap-1">
            <Text className="text-sm font-medium text-foreground">Room password</Text>
            <TextInput
              value={roomPassword}
              onChangeText={onRoomPassword}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="Your teacher will tell you"
              placeholderTextColor={colors.muted}
              accessibilityLabel="Room password"
              className="min-h-11 rounded-lg border border-border bg-surface px-3 py-2 text-foreground"
            />
          </View>
        )}
        {startError !== null && <Notice tone="danger">{startError}</Notice>}
        <Button onPress={onStart} busy={starting}>
          {`Start ${kind}`}
        </Button>
      </View>
    </Card>
  );
}
