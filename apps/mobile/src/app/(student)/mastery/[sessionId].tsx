// Mastery mode as a student takes it (the web's `MasteryPlayer`): one question at a time, each graded the moment it is
// answered. A wrong answer comes back later; the server keeps the queue, so reopening carries on where the student was.
import type { Paper } from "@examinus/contract/attempt";
import { answerKey } from "@examinus/domain/answer-text";
import { availability } from "@examinus/domain/attempts";
import type { MasteryFeedback, MasteryState } from "@examinus/domain/mastery";
import type { AnswerValue } from "@examinus/domain/quiz";
import { questionTypeLabel } from "@examinus/copy/question-types";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { ApiError, callApi, callResult } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useLoad } from "@/lib/use-load";
import { Markdown } from "@/markdown/markdown";
import { mobilePlatform } from "@/platform/mobile-platform";
import { QuestionInput } from "@/question-kinds/input";
import { Button, Card, Notice, Screen } from "@/ui/components";
import { Result } from "effect";

const heartbeatMs = 15_000;

type Graded = { feedback: MasteryFeedback; next: MasteryState };

// What opening the session came to: the paper, or why the student can't be here (a game has its own screen).
type Opened = { paper: Paper } | { refused: string; tag: string };

async function openPaper(sessionId: string): Promise<Opened> {
  const deviceId = await mobilePlatform.deviceId();
  const result = await callResult((api) => api["attempt.paper"]({ sessionId, deviceId }));
  if (Result.isSuccess(result)) return { paper: result.success };
  const failure = result.failure as { _tag: string; message?: string };
  return { refused: failure.message || "You can't open this session.", tag: failure._tag };
}

export default function MasteryScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const router = useRouter();
  const load = useLoad(useCallback(() => openPaper(sessionId), [sessionId]));
  const opened = load.data;

  useEffect(() => {
    if (!opened) return;
    if ("tag" in opened) {
      if (opened.tag === "PlayInGame") router.replace(`/game/${sessionId}`);
      return;
    }
    const { session } = opened.paper;
    if (session.mode !== "mastery") router.replace(`/take/${sessionId}`);
    // Over, or every attempt used: the result says what happened.
    else if (availability(session.status) === "closed" && !opened.paper.attempt) router.replace(`/results/${sessionId}`);
  }, [opened, router, sessionId]);

  if (!opened) return <Screen load={load}>{load.loading ? <ActivityIndicator className="mt-8" /> : <Notice tone="danger">{load.error ?? "Something went wrong."}</Notice>}</Screen>;
  if ("tag" in opened) return <Screen><Notice tone="danger">{opened.refused}</Notice><Button variant="secondary" onPress={() => router.replace("/")}>Back to home</Button></Screen>;
  const { paper } = opened;
  if (paper.session.mode !== "mastery") return <Screen><ActivityIndicator className="mt-8" /></Screen>;
  if (!paper.attempt) return <Intro paper={paper} onStarted={() => void load.refresh()} />;
  return <MasteryPlayer paper={paper} attemptId={paper.attempt.id} />;
}

// Before the attempt: the session's title and a Start button (or when it opens).
function Intro({ paper, onStarted }: { paper: Paper; onStarted: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const when = availability(paper.session.status);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const deviceId = await mobilePlatform.deviceId();
      await callApi((api) => api["attempt.start"]({ sessionId: paper.session.id, deviceId }));
      onStarted();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title={paper.quiz.title} description="Practice until you master every question. Each answer is checked right away, and a missed question comes back later.">
      <Card className="gap-3 p-4">
        <Text className="text-foreground">{paper.questionCount} questions</Text>
        {when === "upcoming" ? (
          <Notice>{paper.session.opensAt ? `Opens ${formatDateTime(paper.session.opensAt)}. Come back then.` : "Not open yet. Come back later."}</Notice>
        ) : (
          <Button busy={busy} onPress={() => void start()}>
            Start
          </Button>
        )}
        {error !== null && <Notice tone="danger">{error}</Notice>}
      </Card>
      <Button variant="secondary" onPress={() => router.replace("/")}>
        Back to home
      </Button>
    </Screen>
  );
}

function MasteryPlayer({ paper, attemptId }: { paper: Paper; attemptId: string }) {
  const router = useRouter();
  const { session, quiz } = paper;
  const [state, setState] = useState<MasteryState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [value, setValue] = useState<AnswerValue | null>(null);
  const [graded, setGraded] = useState<Graded | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // When the question on screen appeared, for the time spent.
  const shownAt = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const deviceId = await mobilePlatform.deviceId();
        const next = await callApi((api) => api["attempt.masteryState"]({ attemptId, deviceId }));
        if (!cancelled) setState(next);
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Something went wrong.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attemptId]);

  // Tells the server we're here, so the teacher's live view shows the student online.
  const finished = state?.finished ?? false;
  useEffect(() => {
    if (state === null || finished) return;
    const beat = setInterval(() => {
      void mobilePlatform.deviceId().then((deviceId) => callResult((api) => api["attempt.heartbeat"]({ attemptId, deviceId })).catch(() => undefined));
    }, heartbeatMs);
    return () => clearInterval(beat);
  }, [attemptId, state === null, finished]); // eslint-disable-line react-hooks/exhaustive-deps

  const question = graded ? null : (state?.question ?? null);
  const shownId = question ? `${question.id}:${state?.triesUsed ?? 0}` : null;
  useEffect(() => {
    shownAt.current = shownId === null ? null : Date.now();
  }, [shownId]);
  const assetUrls = { ...paper.assetUrls, ...state?.assetUrls, ...graded?.feedback.assetUrls };

  async function check() {
    if (!question || !state) return;
    setError(null);
    // Code and SQL boxes start with the question's starter code, so that counts as the answer until it is edited.
    const answer = value ?? ("starterCode" in question ? (question.starterCode as AnswerValue) : null);
    if (answer === null) {
      setError("Answer the question first.");
      return;
    }
    setChecking(true);
    try {
      const deviceId = await mobilePlatform.deviceId();
      const result = await callApi((api) =>
        api["attempt.masteryAnswer"]({ attemptId, deviceId, questionId: question.id, value: answer, timeSpentMs: Date.now() - (shownAt.current ?? Date.now()) }),
      );
      setGraded({ feedback: result.feedback, next: result.state });
    } catch (e) {
      setError(e instanceof ApiError || e instanceof Error ? e.message : "Couldn't reach the server. Check your connection and try again.");
    }
    setChecking(false);
  }

  function next() {
    if (!graded) return;
    setValue(null);
    setState(graded.next);
    setGraded(null);
  }

  if (loadError !== null) return <Screen><Notice tone="danger">{loadError}</Notice></Screen>;
  if (!state) return <Screen><ActivityIndicator className="mt-8" /></Screen>;

  const shown = graded ? graded.next : state;
  if (shown.finished && !graded) {
    const { mastered, total, missed, pending } = shown;
    return (
      <Screen>
        <Card className="items-center gap-3 p-8">
          <Text className="text-lg font-semibold text-foreground">{quiz.title}: done</Text>
          <Text className="text-4xl font-semibold text-foreground">
            {mastered} <Text className="text-xl text-muted">/ {total} mastered</Text>
          </Text>
          <Text className="text-center text-sm text-muted">
            {missed > 0 && `${missed} ${missed === 1 ? "question" : "questions"} not mastered. `}
            {pending > 0 && `${pending} waiting for your teacher. `}
            {missed === 0 && pending === 0 && "Every question mastered."}
          </Text>
          <Button onPress={() => router.replace(`/results/${session.id}`)}>See my results</Button>
        </Card>
        <Button variant="secondary" onPress={() => router.replace("/")}>
          Back to home
        </Button>
      </Screen>
    );
  }

  return (
    <Screen>
      <View className="gap-1">
        <View className="flex-row items-baseline justify-between gap-2">
          <Text className="flex-1 font-semibold text-foreground" numberOfLines={1}>
            {quiz.title}
          </Text>
          <Text className="text-sm text-muted" accessibilityLabel="Mastery progress">
            {shown.mastered} of {shown.total} mastered · {shown.remaining} to go
          </Text>
        </View>
        <View className="h-2 overflow-hidden rounded-full bg-surface-muted" accessibilityRole="progressbar">
          <View className="h-full bg-success" style={{ width: `${shown.total === 0 ? 0 : (shown.mastered / shown.total) * 100}%` }} />
        </View>
      </View>

      {question && (
        <Card key={`${question.id}:${state.triesUsed}`} className="gap-3 p-4">
          <View className="gap-1">
            {question.type !== "blank" && <Markdown assetUrls={assetUrls}>{question.prompt}</Markdown>}
            <Text className="text-xs text-muted">
              {questionTypeLabel[question.type]}
              {state.triesUsed > 0 && ` · try ${state.triesUsed + 1} of ${state.retryLimit}`}
            </Text>
          </View>
          <QuestionInput question={question} value={value} onChange={setValue} assetUrls={assetUrls} disabled={checking} />
          {error !== null && <Notice tone="danger">{error}</Notice>}
          <Button busy={checking} onPress={() => void check()}>
            {checking ? "Checking…" : "Check answer"}
          </Button>
        </Card>
      )}

      {graded && <FeedbackCard graded={graded} assetUrls={assetUrls} onNext={next} />}
    </Screen>
  );
}

function FeedbackCard({ graded: { feedback: f, next }, assetUrls, onNext }: { graded: Graded; assetUrls: Record<string, string>; onNext: () => void }) {
  const tone = f.correct === null ? "pending" : f.correct ? "right" : "wrong";
  return (
    <Card className={`gap-3 p-4 ${tone === "right" ? "border-success" : tone === "wrong" ? "border-danger" : ""}`}>
      <Text className={`font-semibold ${tone === "right" ? "text-success" : tone === "wrong" ? "text-danger" : "text-foreground"}`} accessibilityRole="alert">
        {tone === "right" && (f.triesUsed === 1 ? "✓ Correct!" : `✓ Correct, on try ${f.triesUsed}.`)}
        {tone === "pending" && "Answer received. Your teacher will grade it."}
        {tone === "wrong" && (f.final ? "✗ Not quite, and you're out of tries for this one." : "✗ Not quite.")}
      </Text>
      {tone === "wrong" && !f.final && (
        <Text className="text-sm text-muted">
          {f.triesLeft} {f.triesLeft === 1 ? "try" : "tries"} left. This question will come back{next.remaining > 1 ? " after a few others" : " next"}.
        </Text>
      )}
      {f.reveal && (
        <View className="gap-1">
          <Text className="text-sm text-muted">Correct answer:</Text>
          <Markdown inline assetUrls={assetUrls}>
            {answerKey(f.reveal)}
          </Markdown>
        </View>
      )}
      {f.explanation !== "" && (
        <View className="rounded-md bg-surface-muted p-3">
          <Markdown small assetUrls={assetUrls}>
            {f.explanation}
          </Markdown>
        </View>
      )}
      <Button onPress={onNext}>{next.finished ? "See how you did" : "Next question"}</Button>
    </Card>
  );
}
