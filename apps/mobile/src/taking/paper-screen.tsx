// The paper as a student takes it (the web's `OnlineExam` + `StudentExam`): intro, one question per screen or all on
// one page as the session says, the question overview and mark for review, autosave with an offline queue, the server's
// deadline and per-question timers, the teacher's live stream (pause, lock, add time, end, warnings) and submit.
import type { Paper } from "@examinus/contract/attempt";
import type { LiveStudentEvent, StudentEndReason } from "@examinus/contract/live";
import { modeLabel } from "@examinus/copy/modes";
import { drawingAssetIds, parseDrawingAnswer } from "@examinus/domain/drawing";
import { kindOf } from "@examinus/domain/kinds";
import type { StudentQuestion } from "@examinus/domain/question";
import { markLimitMessage } from "@examinus/domain/review";
import type { AnswerValue, IntegrityEvent } from "@examinus/domain/quiz";
import { useAnswerSaving } from "@examinus/taking/answer-saving";
import { useAttemptLink } from "@examinus/taking/attempt-link";
import { useIntegrityLog } from "@examinus/taking/integrity";
import { buildNavItems, type NavItem } from "@examinus/taking/nav-items";
import { logEdits, logTyped, typedTypes } from "@examinus/taking/typing";
import type { Answers, TakeMode, Typing } from "@examinus/taking/types";
import NetInfo from "@react-native-community/netinfo";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import { AppState, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { followStudent } from "@/live/client";
import { Markdown } from "@/markdown/markdown";
import { clearClipboard, mobilePlatform } from "@/platform/mobile-platform";
import { QuestionInput } from "@/question-kinds/input";
import type { DrawingFinalizer } from "@/question-kinds/types";
import { Badge, Button, Card, Notice } from "@/ui/components";
import { questionTypeLabel } from "@examinus/copy/question-types";
import { Confirm, Dialog } from "./dialog";
import { GuidedAccessPrompt, guidedAccessSteps, useGuidedAccessMissing, Watermark } from "./exam-guards";
import { ExamHeader, IntroScreen, MarkToggle, OverviewSheet, QuestionOverview, ReviewScreen } from "./paper-parts";
import { flushPending, makeRpcTakeMode, type Refusal } from "./rpc-take-mode";
import { pendingSaves } from "./offline-queue";
import { useAssetUrls } from "./use-asset-urls";
import { useTimeSpent } from "./use-time-spent";

type LiveState = Extract<LiveStudentEvent, { _tag: "state" }>;
type Warning = { message: string; at: string };

const endedText: Record<StudentEndReason, string> = {
  teacher: "Your teacher submitted your attempt.",
  session_ended: "Your teacher ended the session, so your attempt was submitted.",
  time_up: "Time ran out, so your attempt was submitted.",
};

const roman = (n: number) => {
  const table: [number, string][] = [[10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
  let rest = n;
  return table.reduce((out, [value, mark]) => {
    while (rest >= value) {
      out += mark;
      rest -= value;
    }
    return out;
  }, "");
};
const partHeading = (title: string, number: number) => {
  const name = title.trim();
  if (/^part\s+([ivxlc]+|\d+)\b/i.test(name)) return name;
  return name ? `Part ${roman(number)} – ${name}` : `Part ${roman(number)}`;
};
const pointsLabel = (n: number) => `${n} ${n === 1 ? "pt" : "pts"}`;
const offlineMessage = "Couldn't reach the server. Check your connection and try again.";

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
  const typing = useRef<Typing>(Object.fromEntries(Object.entries(paper.typing).map(([id, edits]) => [id, [...edits]])));
  const [answers, setAnswers] = useState<Answers>(() => ({ ...paper.answers }));
  const answersLive = useRef<Answers>(answers);
  const drawingPictures = questions.flatMap((q) => (kindOf(q).answerPictures ? drawingAssetIds(parseDrawingAnswer(answers[q.id])) : []));
  const { urls: assetUrls } = useAssetUrls(paper.assetUrls, drawingPictures);
  const drawingFinalizers = useRef(new Map<string, DrawingFinalizer>());
  const registerDrawing = useCallback((id: string, finalize: DrawingFinalizer | null) => {
    if (finalize) drawingFinalizers.current.set(id, finalize);
    else drawingFinalizers.current.delete(id);
  }, []);

  const [starting, setStarting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [roomPassword, setRoomPassword] = useState("");
  const [lostLink, setLostLink] = useState<string | null>(null);
  const [lateNotice, setLateNotice] = useState<string | null>(null);
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

  const toResult = useCallback(() => router.replace({ pathname: "/results/[sessionId]", params: { sessionId, submitted: "1" } }), [router, sessionId]);
  // Once the server has submitted the attempt, show why and move on to the result.
  useEffect(() => {
    if (!ended) return;
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
  const [markBusy, setMarkBusy] = useState(false);
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

  // --- Take mode over the bearer RPC ---
  const finalizing = useRef(false);
  const submitRef = useRef<(forced?: boolean, events?: IntegrityEvent[]) => Promise<void>>(async () => {});
  const takeRef = useRef<TakeMode | undefined>(undefined);
  const take = useMemo(
    () =>
      makeRpcTakeMode({
        sessionId,
        attemptId,
        deviceId: mobilePlatform.deviceId,
        client: { kind: mobilePlatform.kind, version: mobilePlatform.version, platform: mobilePlatform.platform },
        watermark: student.watermark,
        codeRunner: paper.codeRunner,
        onRefusal,
        onStarted: reload,
        onMoved: reload,
        onReload: reload,
        onSubmitted: toResult,
        onLate: setLateNotice,
      }),
    [sessionId, attemptId, student.watermark, paper.codeRunner, onRefusal, toResult, reload],
  );
  useEffect(() => {
    takeRef.current = take;
  });

  const sensors = useMemo(() => mobilePlatform.sensors(rules), [rules]);
  const noEvents = useMemo<IntegrityEvent[]>(() => [], []);
  const guard = useIntegrityLog({ active: stage === "taking", settings: rules, initial: noEvents, sensors, onLimit: (events) => void submitRef.current(true, events) });
  const guardRef = useRef(guard);
  useEffect(() => {
    guardRef.current = guard;
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
    const served = paperRef.current;
    answersLive.current = { ...answersLive.current, ...served.answers };
    for (const [id, edits] of Object.entries(served.typing)) typing.current[id] ??= [...edits];
  }, [servedIndex]);

  const spent = useTimeSpent({ active: stage === "taking" && view === "questions", sequentialId: sequential ? (questions[0]?.id ?? null) : null });
  const timeSpentRef = useRef<(id: string) => number>(() => 0);
  useEffect(() => {
    timeSpentRef.current = spent.snapshot;
  });
  const saving = useAnswerSaving({ takeRef, typing, timeSpentRef, finalizing, submitRef });
  const onWake = useCallback((beat: () => void) => {
    const sub = AppState.addEventListener("change", (state) => state === "active" && beat());
    return () => sub.remove();
  }, []);
  const sentEvents = useAttemptLink({ active: stage === "taking", takeRef, guardRef, finalizing, onRefused: setLostLink, onWake });

  // --- Answers kept on the phone while offline: merged in when the quiz opens, sent when the network is back ---
  useEffect(() => {
    if (!attemptId) return;
    let stopped = false;
    const send = async () => {
      const { refused } = await flushPending(attemptId, await mobilePlatform.deviceId());
      if (!stopped && refused !== null) setLateNotice(refused);
    };
    void pendingSaves.load(attemptId).then((kept) => {
      if (stopped) return;
      const ids = new Set(questions.map((q) => q.id));
      const mine = Object.entries(kept).filter(([id]) => !sequential || ids.has(id));
      if (mine.length > 0) {
        const values = Object.fromEntries(mine.map(([id, save]) => [id, save.value]));
        answersLive.current = { ...answersLive.current, ...values };
        setAnswers((prev) => ({ ...prev, ...values }));
      }
      void send();
    });
    let wasConnected: boolean | null = null;
    const unsubscribe = NetInfo.addEventListener((state) => {
      const connected = state.isConnected === true;
      if (connected && wasConnected === false) void send();
      wasConnected = connected;
    });
    return () => {
      stopped = true;
      unsubscribe();
    };
    // Read once per attempt; later answers reach the server through the saving queue.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptId]);

  function set(id: string, v: AnswerValue) {
    answersLive.current = { ...answersLive.current, [id]: v };
    setAnswers((prev) => ({ ...prev, [id]: v }));
    saving.queue(id, v);
  }

  async function settleDrawings(): Promise<string | null> {
    let failure: string | null = null;
    await Promise.all(
      [...drawingFinalizers.current.values()].map((finalize) =>
        finalize().catch((e: unknown) => {
          failure = `Your drawing couldn't be uploaded: ${e instanceof Error ? e.message : "try again"}. Check your connection and try again.`;
        }),
      ),
    );
    return failure;
  }

  // `forced`: time ran out or too many warnings, so no confirmation.
  async function submit(forced = false, events?: IntegrityEvent[], confirmed = false) {
    if (!forced && !confirmed && answered < items.length) {
      const left = items.length - answered;
      setConfirmSubmit(`${left} ${left === 1 ? "question is" : "questions are"} unanswered. Submit anyway?`);
      return;
    }
    const all = events ?? guard.finish();
    finalizing.current = true;
    saving.discard();
    setSubmitting(true);
    setSubmitError(null);
    const drawingError = await settleDrawings();
    if (drawingError && !forced) {
      finalizing.current = false;
      setSubmitError(drawingError);
      setSubmitting(false);
      return;
    }
    let error: string | null;
    try {
      error = await take.onSubmit(answersLive.current, all.slice(sentEvents.current), typing.current);
    } catch {
      error = offlineMessage;
    }
    if (error) {
      finalizing.current = false;
      setSubmitError(error);
      setSubmitting(false);
    }
  }
  useEffect(() => {
    submitRef.current = (forced, events) => submit(forced, events, forced);
  });

  // One question at a time: opening another question saves this one first (its drawing too), then the server moves
  // and the paper is read again.
  const movingRef = useRef(false);
  const [moving, setMoving] = useState(false);
  async function leaveQuestion(move: (current: TakeMode) => Promise<string | null>) {
    const id = questions[0]?.id;
    if (movingRef.current || id === undefined) return;
    movingRef.current = true;
    setMoving(true);
    const drawingError = await settleDrawings();
    if (drawingError && qSecondsLeft !== 0) {
      setLostLink(drawingError);
      movingRef.current = false;
      setMoving(false);
      return;
    }
    await saving.flushNow(id).catch(() => undefined);
    let error: string | null;
    try {
      error = await move(take);
    } catch {
      error = offlineMessage;
    }
    setNavNotice(error);
    if (!error) setView("questions");
    movingRef.current = false;
    setMoving(false);
  }
  const go = (index: number) => leaveQuestion((current) => current.onGoTo(index));
  const timeUpRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    timeUpRef.current = () =>
      leaveQuestion(async (current) => {
        current.onReload();
        return null;
      });
  });

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
    const count = Object.values(marks).filter(Boolean).length;
    if (next && session.maxMarked !== null && count >= session.maxMarked) return setNavNotice(markLimitMessage(session.maxMarked));
    setMarkBusy(true);
    let error: string | null;
    try {
      error = await take.onMark(id, next);
    } catch {
      error = offlineMessage;
    }
    setMarkBusy(false);
    if (error) setNavNotice(error);
    else setMarks((m) => ({ ...m, [id]: next }));
  }

  // The countdowns run to the server's deadlines; at zero the answers are handed in, or the next question comes.
  useEffect(() => {
    if (stage === "taking" && secondsLeft === 0 && !finalizing.current) void submitRef.current(true);
  }, [stage, secondsLeft]);
  useEffect(() => {
    if (stage !== "taking" || qSecondsLeft !== 0 || finalizing.current) return;
    if (isLast) void submitRef.current(true);
    else void timeUpRef.current();
    // Retried every second (`now`) until the server, whose clock may be a moment behind, has moved on.
  }, [stage, qSecondsLeft, isLast, qDeadline, now]);

  async function start() {
    if (session.roomPasswordRequired && roomPassword.trim() === "") {
      setStartError("Type the room password your teacher gave you.");
      return;
    }
    if (guidedAccessMissing) {
      setStartError(guidedAccessSteps);
      return;
    }
    setStartError(null);
    setStarting(true);
    if (rules.clearClipboardOnStart) await clearClipboard().catch(() => undefined);
    let error: string | null;
    try {
      error = await take.onStart(roomPassword);
    } catch {
      error = offlineMessage;
    }
    if (error) {
      setStarting(false);
      setStartError(error);
    }
  }

  const body = (() => {
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
            if (typedTypes.has(q.type) && attempt) logTyped(typing.current, q.id, attempt.startedAt, answers[q.id], v);
            set(q.id, v);
          }}
          onEdit={attempt ? (edits) => logEdits(typing.current, q.id, attempt.startedAt, edits) : undefined}
          disabled={submitting}
          assetUrls={assetUrls}
          runOnServer={take.runCode}
          registerDrawing={registerDrawing}
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
          saveState={saving.saveState}
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
                <Button onPress={() => void submit()} busy={submitting}>
                  {`Submit ${kind}`}
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
                variant={backToFurthest ? "secondary" : "primary"}
                onPress={() => {
                  setSheetOpen(false);
                  setNavNotice(null);
                  setView("review");
                }}
              >
                Review and submit
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
            void submit(false, undefined, true);
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
