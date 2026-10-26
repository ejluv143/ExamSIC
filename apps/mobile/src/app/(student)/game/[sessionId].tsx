// The player's game screen (the web's `GamePlayer`): waiting in the lobby, the question with its timer, what the answer
// earned, the standings, and for Team Relay the team's board. Everything shown comes from the server's `GameView`
// (the live stream); the phone only sends answers.
import type { GameView } from "@examinus/contract/game";
import type { AnswerValue } from "@examinus/domain/quiz";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState, type ReactNode } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { answerGame, answerRescue, joinGame, nextGame } from "@/game/actions";
import { AvatarImage } from "@/game/avatar";
import { choiceStyles, CountdownBar, Leaderboard, Podium, TeamPodium } from "@/game/parts";
import { RelayPlayerLobby, RelayTeamPanel, RescueList, RetryButton, TeamDebrief } from "@/game/relay";
import { GameStandingsList } from "@/game/standings";
import { useGameView, useRemainingMs, useRoundMs } from "@/game/use-game";
import { Markdown } from "@/markdown/markdown";
import { QuestionInput } from "@/question-kinds/input";
import { Button, Card } from "@/ui/components";

function Stage({ children, center = true }: { children: ReactNode; center?: boolean }) {
  return <View className={`w-full flex-1 gap-4 ${center ? "items-center justify-center" : ""}`}>{children}</View>;
}

function Centered({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <Stage>
      <Text className="text-center text-2xl font-semibold text-foreground">{title}</Text>
      {children}
    </Stage>
  );
}

function ErrorLine({ children }: { children: string | null }) {
  return children === null ? null : (
    <Text accessibilityRole="alert" className="text-center text-sm text-danger">
      {children}
    </Text>
  );
}

export default function GameScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Taking a seat is idempotent, so coming back just works. While the teacher hasn't opened the game yet, it asks
  // again every few seconds.
  const [joined, setJoined] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const attempt = async () => {
      const refusal = await joinGame(sessionId);
      if (stop) return;
      if (refusal !== null) {
        setJoinError(refusal);
        timer = setTimeout(() => void attempt(), 3000);
      } else {
        setJoinError(null);
        setJoined(true);
      }
    };
    void attempt();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [sessionId]);

  const { stamped, status } = useGameView(sessionId, joined);
  const remaining = useRemainingMs(stamped);
  const roundMs = useRoundMs(stamped);
  const view = stamped?.view ?? null;
  const [rejoinError, setRejoinError] = useState<string | null>(null);

  let screen: ReactNode;
  if (!joined)
    screen = (
      <Centered title="Joining the game…">
        <Text className="text-center text-sm text-muted">{joinError ?? "One moment."}</Text>
        <ActivityIndicator />
      </Centered>
    );
  else if (status === "closed" && !view)
    screen = (
      <Centered title="You're not in this game">
        <Text className="text-center text-sm text-muted">You may have been removed by your teacher, or the game doesn&apos;t exist any more.</Text>
        <Button onPress={() => router.replace("/")}>Back to home</Button>
      </Centered>
    );
  else if (!view) screen = <Centered title="Connecting…" />;
  else if (!view.me)
    screen = (
      <Centered title="You're not in this game">
        <Text className="text-center text-sm text-muted">Your teacher removed you from the game.</Text>
        <Button onPress={() => void joinGame(sessionId).then(setRejoinError)}>Join again</Button>
        <ErrorLine>{rejoinError}</ErrorLine>
      </Centered>
    );
  else screen = <Playing view={view} remainingMs={remaining} roundMs={roundMs} sessionId={sessionId} />;

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <View className="flex-row items-center justify-between px-4 py-2">
        <Text className="text-sm text-muted" accessibilityRole="link" onPress={() => router.replace("/")}>
          Exit
        </Text>
        {status !== "live" && joined && <Text className="text-sm text-warning">{status === "closed" ? "Disconnected" : "Connecting…"}</Text>}
      </View>
      <ScrollView className="flex-1" contentContainerStyle={{ flexGrow: 1, padding: 16, paddingTop: 0 }} keyboardShouldPersistTaps="handled">
        {screen}
      </ScrollView>
    </View>
  );
}

function Playing({ view, remainingMs, roundMs, sessionId }: { view: GameView; remainingMs: number | null; roundMs: number | null; sessionId: string }) {
  const me = view.me!;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ id: string; value: AnswerValue | null } | null>(null);
  const [showAll, setShowAll] = useState(false);
  const q = view.question;
  const value = q && draft?.id === q.id ? draft.value : null;
  const locked = me.answered || remainingMs === 0 || view.paused;
  // A single tap answers a choice or true/false question at once.
  const tapToAnswer = q?.type === "true_false" || (q?.type === "multiple_choice" && !q.multipleCorrect);

  // The player's place when each question opened, so the leaderboard after it can say how far they moved. The first
  // sighting per question wins: in a student-paced game the rank keeps moving while others answer.
  const [rankBefore, setRankBefore] = useState<{ index: number; rank: number } | null>(null);
  if (view.phase === "question" && rankBefore?.index !== view.questionIndex) setRankBefore({ index: view.questionIndex, rank: me.rank });

  async function submit(answer: AnswerValue) {
    if (!q) return;
    setPending(true);
    // A teammate's question claimed for rescue is answered through its own call; the owner's answer is untouched.
    const rescuing = view.relay?.team?.rescuing === q.id;
    setError(await (rescuing ? answerRescue(sessionId, q.id, answer) : answerGame(sessionId, q.id, answer)));
    setPending(false);
  }

  async function next() {
    setPending(true);
    setError(await nextGame(sessionId));
    setPending(false);
  }

  const relayPanel = (retryButton = true) =>
    view.relay?.team && (
      <View className="w-full">
        <RelayTeamPanel relay={view.relay} sessionId={sessionId} meAttemptId={me.attemptId} meName={me.name} roundMs={roundMs} retryButton={retryButton} />
      </View>
    );

  const header = (
    <View className="w-full flex-row items-center gap-3">
      <AvatarImage avatar={me.avatar} size={32} />
      <Text className="flex-1 font-semibold text-foreground" numberOfLines={1}>
        {me.name}
      </Text>
      <Text className="font-semibold text-foreground" accessibilityLabel="Points">
        🏆 {me.points.toLocaleString()}
      </Text>
      {me.streak >= 2 && (
        <Text className="font-semibold text-orange-500" accessibilityLabel={`Streak of ${me.streak}`}>
          🔥 {me.streak}
        </Text>
      )}
    </View>
  );

  if (view.phase === "lobby")
    return (
      <View className="w-full flex-1 gap-4">
        {header}
        <Stage>
          <AvatarImage avatar={me.avatar} size={128} />
          <Text className="text-center text-3xl font-semibold text-foreground">{view.title}</Text>
          {view.relay && view.status !== "running" ? (
            <>
              <Text className="text-center text-2xl font-medium text-primary">You&apos;re in!</Text>
              <Text className="text-center text-base text-muted">
                {view.status === "scheduled" ? "Waiting for your teacher to open the game." : "Waiting for your teacher to start the relay."}
              </Text>
              {view.status === "lobby" && <RelayPlayerLobby relay={view.relay} sessionId={sessionId} />}
            </>
          ) : view.pacing === "student" && view.status === "running" ? (
            <>
              <Text className="text-center text-base text-muted">
                {view.questionCount} questions, {view.questionSeconds} seconds each. Faster correct answers earn more.
              </Text>
              {relayPanel()}
              <View className="w-full">
                <Button busy={pending} onPress={() => void next()}>
                  Play
                </Button>
              </View>
            </>
          ) : (
            <>
              <Text className="text-center text-2xl font-medium text-primary">You&apos;re in!</Text>
              <Text className="text-center text-base text-muted">
                {view.status === "scheduled" ? "Waiting for your teacher to open the game." : "Waiting for your teacher to start. Look at the big screen."}
              </Text>
            </>
          )}
          <ErrorLine>{error}</ErrorLine>
        </Stage>
      </View>
    );

  // The question takes the whole screen: the prompt on top, the answers below.
  if (view.phase === "question" && q)
    return (
      <View className="w-full gap-4">
        {header}
        <CountdownBar remainingMs={remainingMs} totalSeconds={view.questionSeconds} />
        {view.paused && <Text className="text-center text-lg font-semibold text-warning">Paused by your teacher</Text>}
        {relayPanel()}
        <Card key={q.id} className="gap-4 p-4">
          <Text className="text-sm text-muted">
            Question {view.questionIndex + 1} of {view.questionCount}
          </Text>
          {view.relay?.team?.rescuing === q.id && <Text className="text-sm font-medium text-primary">Rescue: you are answering a teammate&apos;s question.</Text>}
          {q.type !== "blank" && (
            <View>
              <Markdown assetUrls={view.assetUrls}>{q.prompt}</Markdown>
            </View>
          )}
          <QuestionInput
            question={q}
            value={value}
            onChange={(v) => setDraft({ id: q.id, value: v })}
            assetUrls={view.assetUrls}
            disabled={locked || pending}
            tap={tapToAnswer ? { disabled: locked || pending, submit: (v: AnswerValue) => void submit(v), styles: choiceStyles } : undefined}
          />
          {!tapToAnswer && (
            <Button disabled={locked || value === null} busy={pending} onPress={() => void submit(value)}>
              Lock in answer
            </Button>
          )}
          {me.answered && (
            <Text className="text-center text-sm font-medium text-primary">
              Answer locked in{view.pacing === "teacher" ? ". You'll see how you did when time is up." : "."}
            </Text>
          )}
          <ErrorLine>{error}</ErrorLine>
        </Card>
      </View>
    );

  if (view.phase === "reveal") {
    const last = me.last;
    const right = last?.correct === true;
    const wrong = last?.answered === true && last.correct === false;
    return (
      <View className={`w-full flex-1 gap-4 rounded-xl p-2 ${right ? "bg-emerald-50" : wrong ? "bg-red-50" : ""}`} testID="player-reveal">
        {header}
        <Stage>
          {last?.correct === null ? (
            <Text className="text-center text-4xl font-bold text-foreground">Answer received</Text>
          ) : !last?.answered ? (
            <Text className="text-center text-4xl font-bold text-foreground">Time&apos;s up</Text>
          ) : right ? (
            <Text className="text-center text-4xl font-bold text-emerald-600">✓ Correct</Text>
          ) : (
            <Text className="text-center text-4xl font-bold text-red-600">✗ Not quite</Text>
          )}
          <Text className={`text-6xl font-black ${right ? "text-emerald-700" : wrong ? "text-red-700" : "text-foreground"}`} accessibilityLabel="Points earned">
            +{(last?.earned ?? 0).toLocaleString()}
          </Text>
          {right && me.streak >= 2 && (
            <Text className="rounded-full bg-orange-500 px-5 py-2 text-lg font-bold text-white">
              🔥 {me.streak >= 5 ? "Unstoppable!" : me.streak >= 3 ? "On fire!" : "Streak!"} {me.streak} in a row
            </Text>
          )}
          {view.reveal?.answer && !right && last?.correct !== null && (
            <Text className="text-center text-lg text-muted">
              Answer: <Text className="font-medium text-foreground">{view.reveal.answer}</Text>
            </Text>
          )}
          <Text className="text-center text-lg text-muted">
            You&apos;re #{me.rank} with {me.points.toLocaleString()} points
          </Text>
          {view.relay?.team && (
            <View className="w-full">
              <RetryButton team={view.relay.team} sessionId={sessionId} />
            </View>
          )}
          {view.pacing === "student" ? (
            <View className="w-full">
              <Button busy={pending} onPress={() => void next()}>
                {view.questionIndex + 1 >= view.questionCount ? "Finish" : "Next question"}
              </Button>
            </View>
          ) : (
            <Text className="text-center text-lg text-muted">Look at the big screen.</Text>
          )}
          <ErrorLine>{error}</ErrorLine>
          {relayPanel(false)}
        </Stage>
      </View>
    );
  }

  // A relay player who finished their own questions waits with the team: its board, the rescue list, the debrief.
  if (view.phase === "leaderboard" && view.relay) {
    const relay = view.relay;
    return (
      <View className="w-full gap-4">
        {header}
        <Text className="text-center text-3xl font-bold text-foreground">{relay.team?.finished ? "Your team is done" : "You finished your questions"}</Text>
        {!relay.team?.finished && <Text className="text-center text-lg text-muted">Your team is still working on the password.</Text>}
        {relay.team && (
          <>
            {relayPanel()}
            <RescueList team={relay.team} sessionId={sessionId} />
            <TeamDebrief team={relay.team} />
          </>
        )}
      </View>
    );
  }

  if (view.phase === "leaderboard") {
    const from = rankBefore?.index === view.questionIndex ? rankBefore.rank : null;
    const moved = from === null ? 0 : from - me.rank;
    return (
      <View className="w-full gap-4">
        {header}
        <Text className="text-center text-3xl font-bold text-foreground">{view.finished ? "You finished!" : "Leaderboard"}</Text>
        {view.finished && <Text className="text-center text-lg text-muted">Waiting for the others.</Text>}
        <View className="items-center gap-2">
          <Text className="text-sm font-medium uppercase text-muted">Your place</Text>
          <Text className="text-6xl font-black text-foreground" accessibilityLabel={`Place ${me.rank}`}>
            #{me.rank}
          </Text>
          {from !== null && (
            <Text className={`rounded-full px-3 py-1 text-sm font-semibold ${moved > 0 ? "bg-emerald-100 text-emerald-700" : moved < 0 ? "bg-red-100 text-red-700" : "bg-surface-muted text-muted"}`}>
              {moved > 0 ? `▲ Up ${moved} ${moved === 1 ? "place" : "places"}` : moved < 0 ? `▼ Down ${-moved} ${moved === -1 ? "place" : "places"}` : `Held #${me.rank}`}
            </Text>
          )}
        </View>
        <Leaderboard rows={view.leaderboard.slice(0, 5)} meId={me.attemptId} />
        {me.rank > 5 && <Text className="text-center text-lg text-muted">{me.points.toLocaleString()} points</Text>}
      </View>
    );
  }

  const fullStandings = showAll ? (
    <GameStandingsList sessionId={sessionId} />
  ) : (
    <Button variant="secondary" onPress={() => setShowAll(true)}>
      Full standings
    </Button>
  );

  if (view.relay) {
    const relay = view.relay;
    const myTeam = relay.teams.find((t) => t.id === relay.myTeamId);
    return (
      <View className="w-full gap-4">
        {header}
        <Text className="text-center text-3xl font-bold text-foreground">Final team results</Text>
        <TeamPodium teams={relay.teams} />
        {myTeam && (
          <Text className="text-center text-xl font-semibold text-foreground">
            Team {myTeam.name} finished #{myTeam.rank} with {myTeam.points.toLocaleString()} points
          </Text>
        )}
        {relay.team && (
          <>
            {relayPanel()}
            <TeamDebrief team={relay.team} />
          </>
        )}
        {fullStandings}
      </View>
    );
  }

  // ended
  return (
    <View className="w-full gap-4">
      {header}
      <Text className="text-center text-3xl font-bold text-foreground">Final results</Text>
      <Podium rows={view.leaderboard.slice(0, 3)} />
      <Text className="text-center text-xl font-semibold text-foreground">
        You finished #{me.rank} with {me.points.toLocaleString()} points
      </Text>
      <Leaderboard rows={view.leaderboard.slice(0, 10)} meId={me.attemptId} />
      {fullStandings}
    </View>
  );
}
