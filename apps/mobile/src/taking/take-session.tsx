// A quiz as its student takes it: opens the paper over the bearer RPC and shows what the session allows: the lobby,
// the paper, or why it can't be taken now (waiting for the teacher to approve this device, computers only, blocked, the
// app is outdated). The web's `TakeAssessment`.
import type { Paper } from "@examinus/contract/attempt";
import { takeBlocked, takeOnComputer, refusalScreen } from "@examinus/copy/errors";
import { modeLabel } from "@examinus/copy/modes";
import { availability, hasAttemptsLeft } from "@examinus/domain/attempts";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Linking, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { callResult } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useUser } from "@/lib/session";
import { followLobby } from "@/live/client";
import { mobilePlatform } from "@/platform/mobile-platform";
import { Button, Card, Notice, Screen } from "@/ui/components";
import { PaperScreen } from "./paper-screen";
import { refusalOf, type Refusal } from "./rpc-take-mode";
import { Result } from "effect";

type Opened = { kind: "loading" } | { kind: "paper"; paper: Paper } | { kind: "refused"; refusal: Refusal } | { kind: "failed"; message: string };

const approvalPollMs = 4000;

export function TakeSession({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const user = useUser();
  const [opened, setOpened] = useState<Opened>({ kind: "loading" });
  const stopped = useRef(false);

  const open = useCallback(async () => {
    try {
      const device = await mobilePlatform.deviceId();
      const result = await callResult((api) =>
        api["attempt.paper"]({
          sessionId,
          deviceId: device,
          client: { kind: mobilePlatform.kind, version: mobilePlatform.version, platform: mobilePlatform.platform },
        }),
      );
      if (stopped.current) return;
      if (Result.isSuccess(result)) return setOpened({ kind: "paper", paper: result.success });
      const refusal = refusalOf(result.failure);
      // A game has its own screen.
      if (refusal.tag === "PlayInGame") return router.replace({ pathname: "/game/[sessionId]", params: { sessionId } });
      if (refusalScreen(refusal.tag) !== null) return setOpened({ kind: "refused", refusal });
      if (refusal.tag === "NotFound") return setOpened({ kind: "failed", message: "That session no longer exists." });
      // Time ran out, or the attempts are used up: the result says what happened.
      router.replace({ pathname: "/results/[sessionId]", params: { sessionId } });
    } catch (e) {
      if (!stopped.current) setOpened((current) => (current.kind === "paper" ? current : { kind: "failed", message: e instanceof Error ? e.message : "Something went wrong." }));
    }
  }, [sessionId, router]);

  useEffect(() => {
    stopped.current = false;
    // Opens the paper when the screen shows.
    void open();
    return () => {
      stopped.current = true;
    };
  }, [open]);

  // The teacher must approve this device: ask every few seconds and carry on by itself.
  const waiting = opened.kind === "refused" && refusalScreen(opened.refusal.tag) === "waiting";
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => void open(), approvalPollMs);
    return () => clearInterval(timer);
  }, [waiting, open]);

  const reload = useCallback(() => void open(), [open]);
  const onRefusal = useCallback((refusal: Refusal) => setOpened({ kind: "refused", refusal }), []);
  const back = () => (router.canGoBack() ? router.back() : router.replace("/"));

  if (opened.kind === "loading")
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator />
      </View>
    );
  if (opened.kind === "failed")
    return (
      <Screen>
        <Notice tone="danger">{opened.message}</Notice>
        <Button onPress={() => { setOpened({ kind: "loading" }); void open(); }}>Try again</Button>
        <Button variant="secondary" onPress={back}>← Back</Button>
      </Screen>
    );
  if (opened.kind === "refused") return <Refused refusal={opened.refusal} onBack={back} />;

  const { paper } = opened;
  const when = availability(paper.session.status);
  // Over, or every attempt used (an attempt in progress counts as used, but can be continued).
  if (when === "closed" || (!paper.attempt && !hasAttemptsLeft(paper.attemptsUsed, paper.session.attemptsAllowed))) {
    router.replace({ pathname: "/results/[sessionId]", params: { sessionId } });
    return null;
  }
  if (when === "lobby" && !paper.attempt) return <Lobby paper={paper} name={user.name} onStarted={() => void open()} onEnded={() => router.replace({ pathname: "/results/[sessionId]", params: { sessionId } })} onBack={back} />;
  if (when === "upcoming")
    return (
      <Screen>
        <Button variant="secondary" onPress={back}>← Back</Button>
        <Card className="items-center gap-2 p-8">
          <Text className="text-lg font-semibold text-foreground">{paper.quiz.title}</Text>
          <Text className="text-center text-sm text-muted">{paper.session.opensAt ? `Opens ${formatDateTime(paper.session.opensAt)}. Come back then.` : "Not open yet. Come back later."}</Text>
        </Card>
      </Screen>
    );

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <PaperScreen paper={paper} student={{ name: user.name, watermark: `${user.name} · ${user.email}` }} reload={reload} onRefusal={onRefusal} />
    </GestureHandlerRootView>
  );
}

// Why the paper can't be taken here: the card for each refusal the API's tags map to.
function Refused({ refusal, onBack }: { refusal: Refusal; onBack: () => void }) {
  const screen = refusalScreen(refusal.tag);
  const outdated = refusal.tag === "ClientOutdated";
  return (
    <Screen>
      <Button variant="secondary" onPress={onBack}>← Back</Button>
      <Card className="items-center gap-2 p-8">
        {screen === "waiting" ? (
          <>
            <ActivityIndicator />
            <Text className="text-center text-lg font-semibold text-foreground">Waiting for your teacher to approve this device</Text>
            <Text className="text-center text-sm text-muted">Keep the app open. It continues by itself when your teacher allows it. The timer keeps running.</Text>
          </>
        ) : screen === "computers_only" ? (
          <>
            <Text className="text-center text-lg font-semibold text-foreground">{takeOnComputer.title}</Text>
            <Text className="text-center text-sm text-muted">{`${refusal.message} ${takeOnComputer.hint}`}</Text>
          </>
        ) : (
          <>
            <Text className="text-center text-lg font-semibold text-foreground">{outdated ? "Update the app" : takeBlocked.title}</Text>
            <Text className="text-center text-sm text-muted">{refusal.message}</Text>
            {outdated && refusal.releasesUrl !== undefined && <Button onPress={() => void Linking.openURL(refusal.releasesUrl!)}>Update Examinus</Button>}
          </>
        )}
      </Card>
    </Screen>
  );
}

// While the lobby is open: students gather here until the teacher presses Start.
function Lobby({ paper, name, onStarted, onEnded, onBack }: { paper: Paper; name: string; onStarted: () => void; onEnded: () => void; onBack: () => void }) {
  const [offline, setOffline] = useState(false);
  const sessionId = paper.session.id;
  useEffect(
    () =>
      followLobby(sessionId, {
        onStatus: (status) => setOffline(status === "reconnecting" || status === "closed"),
        onEvent: (session) => {
          if (session.status === "running") onStarted();
          else if (session.status === "ended") onEnded();
        },
      }),
    [sessionId, onStarted, onEnded],
  );
  // Without a working connection, ask the server every few seconds so nobody is stuck here.
  useEffect(() => {
    if (!offline) return;
    const timer = setInterval(onStarted, 5000);
    return () => clearInterval(timer);
  }, [offline, onStarted]);
  return (
    <Screen>
      <Button variant="secondary" onPress={onBack}>← Back</Button>
      <Card className="items-center gap-3 p-8">
        <Text className="text-sm text-muted">{name}</Text>
        <Text className="text-2xl font-semibold text-foreground">{paper.quiz.title}</Text>
        <Text className="text-sm text-muted">{modeLabel(paper.session.mode)}</Text>
        <Text className="text-xl font-medium text-primary">You&apos;re in!</Text>
        <Text className="text-sm text-muted">Waiting for your teacher to start…</Text>
        {offline && <Text className="text-xs text-muted">Reconnecting to your teacher…</Text>}
      </Card>
    </Screen>
  );
}
