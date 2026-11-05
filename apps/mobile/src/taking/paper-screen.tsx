// The paper as a student takes it (the web's `OnlineExam` + `StudentExam`): intro, one question per screen or all on
// one page as the session says, the question overview and mark for review, autosave with an offline queue (the taking
// flow), the server's
// deadline and per-question timers, the teacher's live stream (pause, lock, add time, end, warnings) and submit.
import type { Paper } from "@examinus/contract/attempt";
import { endedText, partHeading, pointsLabel } from "@examinus/copy/paper";
import type { LiveStudentEvent, StudentEndReason } from "@examinus/contract/live";
import { modeLabel } from "@examinus/copy/modes";
import { drawingAssetIds, parseDrawingAnswer } from "@examinus/domain/drawing";
import { kindOf } from "@examinus/domain/kinds";
import type { StudentQuestion } from "@examinus/domain/question";
import type { AnswerValue, IntegrityEvent } from "@examinus/domain/quiz";
import { useAttemptLink } from "@examinus/taking/attempt-link";
import type { LeaveOutcome } from "@examinus/taking/take-flow";
import { useIntegrityLog } from "@examinus/taking/integrity";
import { buildNavItems, type NavItem } from "@examinus/taking/nav-items";
import { logEdits, logTyped, typedTypes } from "@examinus/taking/typing";
import { useTakeFlow } from "@examinus/taking/use-take-flow";
import type { Answers } from "@examinus/taking/types";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import { AppState, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { followStudent } from "@/live/client";
import { Markdown } from "@/markdown/markdown";
import { clearClipboard, mobilePlatform } from "@/platform/mobile-platform";
import { QuestionInput } from "@/question-kinds/input";
import { Badge, Button, Card, Notice } from "@/ui/components";
import { questionTypeLabel } from "@examinus/copy/question-types";
import { Confirm, Dialog } from "./dialog";
import { guidedAccessSteps } from "@/platform/system-check";
import { ExamGate } from "./exam-gate";
import { GuidedAccessPrompt, useGuidedAccessMissing, Watermark } from "./exam-guards";
import { ExamHeader, IntroScreen, MarkToggle, OverviewSheet, QuestionOverview, ReviewScreen } from "./paper-parts";
import { makeRpcTakeMode, type Refusal } from "./rpc-take-mode";
import { useAssetUrls } from "./use-asset-urls";
import { useTimeSpent } from "./use-time-spent";

type LiveState = Extract<LiveStudentEvent, { _tag: "state" }>;
type Warning = { message: string; at: string };

export function PaperScreen({
  paper,
  student,
  reload,
  onRefusal,
}: {
  paper: Paper;
  student: { name: string; watermark: string };
  // Reads the paper again (after Start, after the server moved to another question, after a pause).
  reload: () => void;
  onRefusal: (refusal: Refusal) => void;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, quiz, attempt } = paper;
  const sessionId = session.id;
  const attemptId = attempt?.id;
  const rules = session.integrity;
  const kind = modeLabel(session.mode).toLowerCase();
  const questions = useMemo(() => paper.parts.flatMap((part) => part.questions), [paper.parts]);
  const stage = attempt ? "taking" : "intro";

  // --- Answers ---
  const [answers, setAnswers] = useState<Answers>(() => ({ ...paper.answers }));
  const drawingPictures = questions.flatMap((q) => (kindOf(q).answerPictures ? drawingAssetIds(parseDrawingAnswer(answers[q.id])) : []));
  const { urls: assetUrls } = useAssetUrls(paper.assetUrls, drawingPictures);

  const [roomPassword, setRoomPassword] = useState("");
  // An exam opens with the system check, the pledge and the rules; Start comes after.
  const [gatePassed, setGatePassed] = useState(false);
  const [lostLink, setLostLink] = useState<string | null>(null);
  const [confirmSubmit, setConfirmSubmit] = useState<string | null>(null);

  // --- Live state: what the teacher is doing, pushed over the live connection ---
  const [live, setLive] = useState<LiveState | null>(null);
  const [warnings, setWarnings] = useState<Warning[]>([]);
  const [ended, setEnded] = useState<StudentEndReason | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const wasPaused = useRef(paper.paused);
  const paused = live ? live.paused : paper.paused;
  const locked = live ? live.locked : paper.locked;
  const reloadRef = useRef(reload);
  useEffect(() => {
    reloadRef.current = reload;
  });

  useEffect(() => {
    if (!attemptId) return;
    return followStudent(attemptId, {
      onStatus: (status) => setReconnecting(status === "reconnecting"),
      onEvent: (event) => {
        if (event._tag === "warning") setWarnings((all) => [...all, { message: event.message, at: event.at }]);
        else if (event._tag === "ended") setEnded(event.reason);
        else {
          // After a pause the question's own clock moved too: read the paper again.
          if (wasPaused.current && !event.paused) reloadRef.current();
          wasPaused.current = event.paused;
          setLive(event);
          if (event.status !== "in_progress") setEnded((reason) => reason ?? "session_ended");
        }
      },
    });
  }, [attemptId]);

  // The result lives in another navigator, so this screen stays mounted behind it: the phone is released here, not by
  // the screen unmounting.
  const toResult = useCallback(() => {
    void mobilePlatform.lockdown.exit();
    router.replace({ pathname: "/results/[sessionId]", params: { sessionId, submitted: "1" } });
  }, [router, sessionId]);
  // Once the server has submitted the attempt, show why and move on to the result.
  useEffect(() => {
    if (!ended) return;
    // The teacher ended it (or time ran out): the pin comes off now, the result follows in a few seconds.
    void mobilePlatform.lockdown.exit();
    const timer = setTimeout(toResult, 4000);
    return () => clearTimeout(timer);
  }, [ended, toResult]);

  // --- Time ---
  const deadline = paused ? null : live ? live.deadline : paper.deadline;
  const deadlineMs = deadline ? Date.parse(deadline) : null;
  const progress = paper.progress && paused ? { ...paper.progress, deadline: null } : paper.progress;
  const sequential = progress !== null;
  const isLast = !progress || progress.index >= paper.questionCount - 1;
  const qDeadline = progress?.deadline ? Date.parse(progress.deadline) : null;
  const [now, setNow] = useState(() => Date.now());
  const secondsLeft = deadlineMs === null ? null : Math.max(0, Math.ceil((deadlineMs - now) / 1000));
  const qSecondsLeft = qDeadline === null ? null : Math.max(0, Math.ceil((qDeadline - now) / 1000));
  useEffect(() => {
    if (stage !== "taking" || (deadlineMs === null && qDeadline === null)) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [stage, deadlineMs, qDeadline]);

  // --- Marks, navigation ---
  const marking = session.maxMarked !== 0;
  const [marks, setMarks] = useState<Record<string, boolean>>(() => Object.fromEntries(paper.review.map((r) => [r.questionId, r.marked])));
  const [view, setView] = useState<"questions" | "review">("questions");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [navNotice, setNavNotice] = useState<string | null>(null);
  // One question at a time, every move reads the paper again: the question now on screen brings its saved answer.
  const servedIndex = progress?.index ?? null;
  const [shownIndex, setShownIndex] = useState(servedIndex);
  if (shownIndex !== servedIndex) {
    setShownIndex(servedIndex);
    setAnswers((prev) => ({ ...prev, ...paper.answers }));
    setMarks(Object.fromEntries(paper.review.map((r) => [r.questionId, r.marked])));
  }
  const { items, refusal } = buildNavItems({ paper, questions, answers, marks, progress, qSecondsLeft });
  const answered = items.filter((i) => i.answered).length;

  // --- Take mode over the bearer RPC, and the taking flow on top of it ---
  const take = useMemo(
    () =>
      makeRpcTakeMode({
        sessionId,
        attemptId,
        deviceId: mobilePlatform.deviceId,
        client: { kind: mobilePlatform.kind, version: mobilePlatform.version, platform: mobilePlatform.platform },
        watermark: student.watermark,
        codeRunner: paper.codeRunner,
        exam: session.mode === "exam",
        onRefusal,
        onStarted: reload,
        onMoved: reload,
        onReload: reload,
        onSubmitted: toResult,
      }),
    [sessionId, attemptId, session.mode, student.watermark, paper.codeRunner, onRefusal, toResult, reload],
  );
  const spent = useTimeSpent({ active: stage === "taking" && view === "questions", sequentialId: sequential ? (questions[0]?.id ?? null) : null });
  const { flow, state } = useTakeFlow({
    deps: {
      take,
      attemptId,
      unanswered: items.length - answered,
      marks,
      maxMarked: session.maxMarked,
      questionId: questions[0]?.id,
      questionTimeUp: qSecondsLeft === 0,
      timeSpent: spent.snapshot,
    },
    storage: AsyncStorage,
    answers: paper.answers,
    typing: paper.typing,
  });
  const { submitting, submitError, starting, startError, moving, markBusy, lateNotice } = state;

  const sensors = useMemo(() => mobilePlatform.sensors(rules), [rules]);
  const noEvents = useMemo<IntegrityEvent[]>(() => [], []);
  const guard = useIntegrityLog({ active: stage === "taking", settings: rules, initial: noEvents, sensors, onLimit: (events) => void flow.submit({ forced: true, events }) });
  useEffect(() => {
    flow.bindEvents(guard);
  });
  // The phone's locked screen (pinned on Android; iOS asks for Guided Access before Start) while the attempt is taken.
  const guidedAccessMissing = useGuidedAccessMissing(stage === "intro" && rules.requireFullscreen);
  useEffect(() => {
    if (stage !== "taking" || !rules.requireFullscreen) return;
    void mobilePlatform.lockdown.enter();
    return () => void mobilePlatform.lockdown.exit();
  }, [stage, rules.requireFullscreen]);
  const chancesLeft = rules.autoSubmitAfter === null ? null : Math.max(0, rules.autoSubmitAfter - guard.timesAway);
  const chancesText =
    chancesLeft === null
      ? ""
      : chancesLeft === 0
        ? ` If you leave again, your ${kind} is submitted automatically.`
        : ` You can leave and come back ${chancesLeft} more ${chancesLeft === 1 ? "time" : "times"}; after that, leaving submits your ${kind}.`;

  // One question at a time: what the student now on another question has saved joins what will be submitted.
  const paperRef = useRef(paper);
  useEffect(() => {
    paperRef.current = paper;
  });
  useEffect(() => {
    if (servedIndex === null) return;
    flow.merge(paperRef.current.answers, paperRef.current.typing);
  }, [servedIndex, flow]);

  const onWake = useCallback((beat: () => void) => {
    const sub = AppState.addEventListener("change", (state) => state === "active" && beat());
    return () => sub.remove();
  }, []);
  useAttemptLink({ active: stage === "taking", flow, onRefused: setLostLink, onWake });

  // --- Answers kept on the phone while offline: merged in when the quiz opens, sent when the network is back ---
  useEffect(() => {
    if (!attemptId) return;
    let stopped = false;
    void flow.resume(sequential ? new Set(questions.map((q) => q.id)) : undefined).then((kept) => {
      if (stopped) return;
      if (Object.keys(kept).length > 0) setAnswers((prev) => ({ ...prev, ...kept }));
      void flow.sendPending();
    });
    let wasConnected: boolean | null = null;
    const unsubscribe = NetInfo.addEventListener((net) => {
      const connected = net.isConnected === true;
      if (connected && wasConnected === false) void flow.sendPending();
      wasConnected = connected;
    });
    return () => {
      stopped = true;
      unsubscribe();
    };
    // Read once per attempt; later answers reach the server through the flow's saving.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptId]);

  function set(id: string, v: AnswerValue) {
    setAnswers((prev) => ({ ...prev, [id]: v }));
    flow.answer(id, v);
  }

  // Unanswered questions ask first; the confirm dialog calls this again with `confirmed`.
  async function submit(confirmed = false) {
    const outcome = await flow.submit({ confirmed });
    if (outcome.status === "confirm") setConfirmSubmit(outcome.message);
  }

  // The result of a move to another question (or the time running out on this one).
  function moved(outcome: LeaveOutcome | null) {
    if (outcome === null || outcome.status === "busy") return;
    if (outcome.status === "drawing") return setLostLink(outcome.error);
    setNavNotice(outcome.status === "refused" ? outcome.error : null);
    if (outcome.status === "moved") setView("questions");
  }
  const go = async (index: number) => moved(await flow.goTo(index));

  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  const cardY = useRef(new Map<string, number>());
  function openQuestion(item: NavItem) {
    setSheetOpen(false);
    setNavNotice(null);
    if (!sequential || item.current) {
      setView("questions");
      if (!sequential) setTimeout(() => scroller.current?.scrollTo({ y: Math.max(0, (cardY.current.get(item.questionId) ?? 0) - 8), animated: true }), 50);
      return;
    }
    if (item.blocked !== null) setNavNotice(item.blocked);
    else void go(item.number - 1);
  }

  async function toggleMark(id: string) {
    const next = !marks[id];
    setNavNotice(null);
    const error = await flow.mark(id, next);
    if (error) setNavNotice(error);
    else setMarks((m) => ({ ...m, [id]: next }));
  }

  // The countdowns run to the server's deadlines; at zero the answers are handed in, or the next question comes.
  useEffect(() => {
    if (stage === "taking" && secondsLeft === 0) void flow.deadlineReached();
  }, [stage, secondsLeft, flow]);
  useEffect(() => {
    if (stage !== "taking" || qSecondsLeft !== 0) return;
    void flow.questionTimeUp(isLast).then(moved);
    // Retried every second (`now`) until the server, whose clock may be a moment behind, has moved on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, qSecondsLeft, isLast, qDeadline, now]);

  const start = () =>
    flow.start({
      roomPassword,
      passwordRequired: session.roomPasswordRequired,
      check: () => (guidedAccessMissing ? guidedAccessSteps : null),
      prepare: rules.clearClipboardOnStart ? () => clearClipboard().catch(() => undefined) : undefined,
    });

  const body = (() => {
    if (stage === "intro" && session.mode === "exam" && session.exam && !gatePassed)
      return (
        <ScrollView className="flex-1" contentContainerClassName="p-4" contentContainerStyle={{ paddingTop: insets.top + 16 }}>
          <ExamGate exam={session.exam} name={student.name} onDone={() => setGatePassed(true)} onBack={() => (router.canGoBack() ? router.back() : router.replace("/"))} />
        </ScrollView>
      );
    if (stage === "intro")
      return (
        <ScrollView className="flex-1" contentContainerClassName="p-4" contentContainerStyle={{ paddingTop: insets.top + 16 }}>
          {guidedAccessMissing && <GuidedAccessPrompt />}
          <IntroScreen paper={paper} kind={kind} assetUrls={assetUrls} roomPassword={roomPassword} onRoomPassword={setRoomPassword} startError={startError} starting={starting} onStart={() => void start()} />
          <View className="mt-3">
            <Button variant="secondary" onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}>
              ← Back
            </Button>
          </View>
        </ScrollView>
      );

    const backToFurthest = progress !== null && session.navigation !== "free" && progress.index < progress.furthest;
    const nextBlocked = progress !== null && !isLast && !backToFurthest ? refusal(progress.index + 1) : null;
    const hints = [
      nextBlocked,
      session.navigation === "marked_only" && (backToFurthest ? "If you leave this question without its mark, you can't come back to it." : "Once you move on, you can only come back to questions marked for review."),
      session.navigation === "forward_only" && !isLast && "You can't go back to a question once you move on.",
    ].filter((x): x is string => typeof x === "string" && x !== "");
    const numbers = new Map(questions.map((q, i) => [q.id, (progress?.index ?? 0) + i + 1]));

    const card = (q: StudentQuestion) => (
      <Card key={q.id} className="gap-3 p-4">
        <View className="flex-row items-start gap-3">
          <View className="h-7 w-7 items-center justify-center rounded-md bg-surface-muted">
            <Text className="text-sm font-semibold text-foreground">{numbers.get(q.id)}</Text>
          </View>
          <View className="min-w-0 flex-1 gap-1">
            {q.type !== "blank" && <Markdown assetUrls={assetUrls}>{q.prompt}</Markdown>}
            <View className="flex-row flex-wrap items-center gap-2">
              <Badge>{questionTypeLabel[q.type]}</Badge>
              <Text className="text-xs text-muted">{pointsLabel(q.points)}</Text>
            </View>
          </View>
        </View>
        {marking && <MarkToggle marked={marks[q.id] ?? false} busy={markBusy} onToggle={() => void toggleMark(q.id)} />}
        <QuestionInput
          question={q}
          value={answers[q.id] ?? null}
          onChange={(v) => {
            if (typedTypes.has(q.type) && attempt) logTyped(flow.typing, q.id, attempt.startedAt, answers[q.id], v);
            set(q.id, v);
          }}
          onEdit={attempt ? (edits) => logEdits(flow.typing, q.id, attempt.startedAt, edits) : undefined}
          disabled={submitting}
          assetUrls={assetUrls}
          runOnServer={take.runCode}
          registerDrawing={flow.registerDrawing}
        />
      </Card>
    );

    return (
      <View className="flex-1">
        <ExamHeader
          title={quiz.title}
          items={items}
          marking={marking}
          answered={answered}
          position={sequential ? `Question ${(progress?.index ?? 0) + 1} of ${paper.questionCount} · ` : ""}
          onOpenSheet={() => setSheetOpen(true)}
          saveState={state.saveState}
          secondsLeft={secondsLeft}
          qSecondsLeft={qSecondsLeft}
        />
        <ScrollView
          ref={scroller}
          className="flex-1"
          contentContainerClassName="gap-4 p-4"
          keyboardShouldPersistTaps="handled"
          onScroll={spent.onScroll}
          onLayout={spent.onViewLayout}
          scrollEventThrottle={100}
        >
          {guard.notice && (
            <Notice tone="warning">
              {guard.notice.message} This was recorded and your teacher will see it.
              {guard.notice.kind === "away" &&
                (rules.autoSubmitAfter !== null && guard.timesAway > rules.autoSubmitAfter
                  ? ` No chances left: your ${kind} is being submitted.`
                  : ` Warning ${guard.timesAway}${rules.autoSubmitAfter !== null ? ` of ${rules.autoSubmitAfter}` : ""}.${chancesText}`)}
            </Notice>
          )}
          {navNotice !== null && view === "questions" && <Notice tone="warning">{navNotice}</Notice>}
          {view === "review" && (
            <ReviewScreen items={items} marking={marking} notice={navNotice} onOpen={openQuestion} onBack={() => { setNavNotice(null); setView("questions"); }}>
              <View className="gap-2">
                {answered < items.length && <Text className="text-sm text-muted">{items.length - answered} unanswered</Text>}
                <Button variant="success" onPress={() => void submit()} busy={submitting}>
                  {`✓ Submit ${kind}`}
                </Button>
              </View>
            </ReviewScreen>
          )}
          {/* Hidden, not removed, on the review screen: drawings and unsaved typing stay as they are. */}
          <View className={view === "review" ? "hidden" : "gap-4"}>
            {paper.parts
              .filter((part) => part.questions.length > 0)
              .map((part, p) => (
                <View key={part.id} className="gap-3">
                  <View>
                    <Text className="font-semibold text-foreground">
                      {partHeading(part.title, p + 1)} <Text className="text-sm font-normal text-muted">{pointsLabel(part.questions.reduce((n, q) => n + q.points, 0))}</Text>
                    </Text>
                    {part.instructions !== "" && <Markdown small muted assetUrls={assetUrls}>{part.instructions}</Markdown>}
                  </View>
                  {part.questions.map((q) => (
                    <View
                      key={q.id}
                      onLayout={(e) => {
                        cardY.current.set(q.id, e.nativeEvent.layout.y);
                        spent.cardLayout(q.id)(e);
                      }}
                    >
                      {card(q)}
                    </View>
                  ))}
                </View>
              ))}
          </View>
          {hints.length > 0 && view === "questions" && <Text className="text-right text-xs text-muted">{hints.join(" ")}</Text>}
          {lostLink !== null && <Notice tone="danger">{lostLink}</Notice>}
          {submitError !== null && <Notice tone="danger">{submitError}</Notice>}
          {lateNotice !== null && <Notice tone="warning">{`Some answers weren't accepted: ${lateNotice}`}</Notice>}
          {reconnecting && !ended && <Text className="text-center text-xs text-muted">Reconnecting to your teacher…</Text>}
        </ScrollView>
        {view === "questions" && (
          <View className="flex-row items-center justify-end gap-2 border-t border-border bg-surface px-4 py-3" style={{ paddingBottom: insets.bottom + 12 }}>
            {!sequential && items.length - answered > 0 && <Text className="mr-auto text-sm text-muted">{items.length - answered} unanswered</Text>}
            {progress && session.navigation === "free" && progress.index > 0 && (
              <Button variant="secondary" onPress={() => void go(progress.index - 1)} disabled={moving}>
                ← Previous
              </Button>
            )}
            {progress && backToFurthest ? (
              <Button onPress={() => void go(progress.furthest)} disabled={moving}>
                {moving ? "Loading…" : `Back to question ${progress.furthest + 1}`}
              </Button>
            ) : (
              progress &&
              !isLast && (
                <Button onPress={() => void go(progress.index + 1)} disabled={moving || nextBlocked !== null}>
                  {moving ? "Loading…" : "Next →"}
                </Button>
              )
            )}
            {(!sequential || isLast) && (
              <Button
                variant={backToFurthest ? "secondary" : "success"}
                onPress={() => {
                  setSheetOpen(false);
                  setNavNotice(null);
                  setView("review");
                }}
              >
                ✓ Review and submit
              </Button>
            )}
          </View>
        )}
        {sheetOpen && (
          <OverviewSheet onClose={() => setSheetOpen(false)}>
            <QuestionOverview
              items={items}
              marking={marking}
              onOpen={openQuestion}
              onReview={() => {
                setSheetOpen(false);
                setNavNotice(null);
                setView("review");
              }}
            />
          </OverviewSheet>
        )}
      </View>
    );
  })();

  return (
    <View className="flex-1 bg-background">
      {body}
      {stage === "taking" && rules.watermark && <Watermark text={student.watermark} />}
      {guard.secondScreen && !ended && (
        <Dialog title="Disconnect the second screen" blocking>
          <Text className="text-sm text-muted">An external display is connected. Your exam is covered until you disconnect it. This was recorded.</Text>
        </Dialog>
      )}
      {confirmSubmit !== null && (
        <Confirm
          title="Submit your answers?"
          message={confirmSubmit}
          confirm="Submit anyway"
          onCancel={() => setConfirmSubmit(null)}
          onConfirm={() => {
            setConfirmSubmit(null);
            void submit(true);
          }}
        />
      )}
      {warnings.length > 0 && !ended && (
        <Dialog title="Message from your teacher" actions={<Button onPress={() => setWarnings([])}>OK</Button>} onClose={() => setWarnings([])}>
          <Text className="text-sm text-muted">{warnings[warnings.length - 1]!.message}</Text>
        </Dialog>
      )}
      {ended && (
        <Dialog title="Attempt submitted" blocking actions={<Button onPress={toResult}>See my result</Button>}>
          <Text className="text-sm text-muted">{endedText[ended]}</Text>
        </Dialog>
      )}
      {!ended && paused && (
        <Dialog title="Session paused" blocking>
          <Text className="text-sm text-muted">Your teacher paused the session. Your time is stopped. Wait here, it will carry on by itself.</Text>
        </Dialog>
      )}
      {!ended && !paused && locked && (
        <Dialog title="Your attempt is locked" blocking>
          <Text className="text-sm text-muted">Your teacher locked your attempt. Your answers are kept. Wait for them to unlock it.</Text>
        </Dialog>
      )}
    </View>
  );
}
