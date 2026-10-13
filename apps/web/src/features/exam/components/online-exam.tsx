"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { RotateCcw } from "lucide-react";
import type { DrawingFinalizer } from "@/components/question-kinds/views/input";
import { modeLabel } from "@/features/session/sessions";
import type { Paper } from "@examinus/contract/attempt";
import type { AnswerValue, IntegrityEvent } from "@examinus/domain/quiz";
import type { Class } from "@/features/classes/types";
import { drawingAssetIds, parseDrawingAnswer } from "@examinus/domain/drawing";
import { kindOf } from "@examinus/domain/kinds";
import { markLimitMessage } from "@examinus/domain/review";
import { clearClipboard, hasSecondScreen, useIntegrity, Watermark } from "./exam-integrity";
import { useAssetUrls } from "@/features/assets/use-asset-urls";
import { NavigatorLayout, QuestionOverview, ReviewScreen, type NavItem } from "./question-navigator";
import { Button, Card } from "@/components/ui";
import { ExamHeader } from "./online-exam/header";
import { IntroScreen } from "./online-exam/intro-screen";
import { NavFooter } from "./online-exam/nav-footer";
import { buildNavItems } from "./online-exam/nav-items";
import { GuardNotice, NavNotice } from "./online-exam/notices";
import { FullscreenOverlay, SecondScreenOverlay } from "./online-exam/overlays";
import { QuestionParts } from "./online-exam/question-parts";
import type { Answers, TakeMode, Typing } from "./online-exam/types";
import { logEdits, logTyped, typedTypes } from "./online-exam/typing";
import { useAnswerSaving } from "./online-exam/use-answer-saving";
import { useAttemptLink } from "./online-exam/use-attempt-link";
import { useFullscreen } from "./online-exam/use-fullscreen";
import { useTimeSpent } from "./online-exam/use-time-spent";

// The exam as a student takes it online (with `take`), or as a read-only preview where answers stay here.
export function OnlineExam({ paper, classes, take }: { paper: Paper; classes: Class[]; take?: TakeMode }) {
  const { session, quiz, attempt } = paper;
  const rules = session.integrity;
  const kind = modeLabel(session.mode).toLowerCase();
  const questions = paper.parts.flatMap((part) => part.questions);

  const [previewStage, setPreviewStage] = useState<"intro" | "taking" | "done">("intro");
  const stage = take ? (attempt ? "taking" : "intro") : previewStage;
  const taking = !!take;
  // Edits to code and SQL answers, timed from the start, for the teacher's typing replay.
  const typing = useRef<Typing>(Object.fromEntries(Object.entries(paper.typing).map(([id, edits]) => [id, [...edits]])));
  const [answers, setAnswers] = useState<Answers>(() => ({ ...paper.answers }));
  // The newest answers, for what runs after an await (a drawing upload finishing, the final submit).
  const answersLive = useRef<Answers>(answers);
  const drawingPictures = questions.flatMap((q) =>
    kindOf(q).answerPictures ? drawingAssetIds(parseDrawingAnswer(answers[q.id])) : [],
  );
  // Signed picture links expire after ten minutes; this keeps them fresh and fetches those of new photos.
  const { urls: assetUrls } = useAssetUrls(paper.assetUrls, drawingPictures);
  // Each drawing question's "upload the latest picture" function, registered while it is on screen.
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
  const [now, setNow] = useState(() => Date.now());
  const deadline = paper.deadline ? Date.parse(paper.deadline) : null;
  const secondsLeft = deadline === null ? null : Math.max(0, Math.ceil((deadline - now) / 1000));
  // One question at a time: the paper holds only the question the student is on.
  const progress = take ? paper.progress : null;
  const sequential = progress !== null;
  const isLast = !progress || progress.index >= paper.questionCount - 1;
  const qDeadline = progress?.deadline ? Date.parse(progress.deadline) : null;
  const qSecondsLeft = qDeadline === null ? null : Math.max(0, Math.ceil((qDeadline - now) / 1000));
  const marking = session.maxMarked !== 0;
  // Marks for review by question id, as the server has them.
  const [marks, setMarks] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(paper.review.map((r) => [r.questionId, r.marked])),
  );
  const [markBusy, setMarkBusy] = useState(false);
  const [view, setView] = useState<"questions" | "review">("questions");
  const [panelOpen, setPanelOpen] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const closeSheet = useCallback(() => setSheetOpen(false), [setSheetOpen]);
  // Why the last move or mark didn't work.
  const [navNotice, setNavNotice] = useState<string | null>(null);
  // One question at a time, every move re-reads the paper: the question now on screen brings its saved answer.
  const servedIndex = progress?.index ?? null;
  const [shownIndex, setShownIndex] = useState(servedIndex);
  if (shownIndex !== servedIndex) {
    setShownIndex(servedIndex);
    setAnswers((prev) => ({ ...prev, ...paper.answers }));
    setMarks(Object.fromEntries(paper.review.map((r) => [r.questionId, r.marked])));
  }

  const { items, refusal } = buildNavItems({ paper, questions, answers, marks, progress, qSecondsLeft });
  const answered = items.filter((i) => i.answered).length;

  const fullscreen = useFullscreen({ take, required: rules.requireFullscreen });
  const [noEvents] = useState<IntegrityEvent[]>([]);

  // The latest callbacks and events, for timers that outlive a render.
  const takeRef = useRef(take);
  const submitRef = useRef<(forced?: boolean, events?: IntegrityEvent[]) => Promise<void>>(async () => {});
  const paperRef = useRef(paper);
  const guard = useIntegrity({
    active: taking && stage === "taking",
    settings: rules,
    needsFullscreen: fullscreen.canFullscreen && !fullscreen.refused,
    initial: noEvents,
    onLimit: (events) => submitRef.current(true, events),
  });
  const guardRef = useRef(guard);
  useEffect(() => {
    takeRef.current = take;
    guardRef.current = guard;
    paperRef.current = paper;
  });
  // How many more times the student may leave and come back before the exam submits itself.
  const chancesLeft = rules.autoSubmitAfter === null ? null : Math.max(0, rules.autoSubmitAfter - guard.timesAway);
  const chancesText =
    chancesLeft === null
      ? ""
      : chancesLeft === 0
        ? ` If you leave again, your ${kind} is submitted automatically.`
        : ` You can leave and come back ${chancesLeft} more ${chancesLeft === 1 ? "time" : "times"}; after that, leaving submits your ${kind}.`;

  // One question at a time: what the student now on another question has saved joins what will be submitted.
  useEffect(() => {
    if (servedIndex === null) return;
    const served = paperRef.current;
    answersLive.current = { ...answersLive.current, ...served.answers };
    for (const [id, edits] of Object.entries(served.typing)) typing.current[id] ??= [...edits];
  }, [servedIndex]);
  // Whether the submit is under way.
  const finalizing = useRef(false);

  const { questionsRef, timeSpentRef } = useTimeSpent({
    active: taking && stage === "taking",
    servedKey: questions.map((q) => q.id).join(","),
  });
  const saving = useAnswerSaving({ takeRef, typing, timeSpentRef, finalizing, submitRef });
  const sentEvents = useAttemptLink({ active: taking && stage === "taking", takeRef, guardRef, finalizing, onRefused: setLostLink });

  function set(id: string, v: AnswerValue) {
    answersLive.current = { ...answersLive.current, [id]: v };
    setAnswers((prev) => ({ ...prev, [id]: v }));
    if (take) saving.queue(id, v);
  }

  // Uploads the latest picture of every drawing on screen; returns a message for the student if one fails.
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
  async function submit(forced = false, events?: IntegrityEvent[]) {
    if (!take) {
      setPreviewStage("done");
      return;
    }
    if (!forced && answered < items.length) {
      const left = items.length - answered;
      const message = `${left} ${left === 1 ? "question is" : "questions are"} unanswered. Submit anyway?`;
      if (!guard.withoutTracking(() => window.confirm(message))) return;
    }
    // The events so far, with an away event that is still open closed at this moment.
    const all = events ?? guard.finish();
    finalizing.current = true;
    saving.discard();
    setSubmitting(true);
    setSubmitError(null);
    // The drawing's latest picture goes up first, so the final answers carry it. When time is up the answers
    // go in as they are: the teacher can still replay the saved strokes.
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
      error = "Couldn't reach the server. Check your connection and submit again.";
    }
    if (error) {
      finalizing.current = false;
      setSubmitError(error);
      setSubmitting(false);
    }
  }

  useEffect(() => {
    submitRef.current = submit;
  });

  // One question at a time: opening another question saves this one first (its drawing too, so the teacher sees
  // what the student left), then the server moves and the page re-reads the paper.
  const movingRef = useRef(false);
  const [moving, setMoving] = useState(false);
  async function leaveQuestion(move: (current: TakeMode) => Promise<string | null>) {
    const current = takeRef.current;
    const id = questions[0]?.id;
    if (!current || movingRef.current || id === undefined) return;
    movingRef.current = true;
    setMoving(true);
    const drawingError = await settleDrawings();
    if (drawingError && qSecondsLeft !== 0) {
      setLostLink(drawingError);
      movingRef.current = false;
      setMoving(false);
      return;
    }
    await saving.flushNow(id);
    let error: string | null;
    try {
      error = await move(current);
    } catch {
      error = "Couldn't reach the server. Check your connection and try again.";
    }
    setNavNotice(error);
    if (!error) setView("questions");
    movingRef.current = false;
    setMoving(false);
  }
  const go = (index: number) => leaveQuestion((current) => current.onGoTo(index));
  // The question's time ran out: the server has moved on, so the page reads where to.
  const timeUpRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    timeUpRef.current = () =>
      leaveQuestion(async (current) => {
        current.onReload();
        return null;
      });
  });

  // From the overview or the review screen: a paper on one page scrolls to the question; one question at a time
  // opens it, when the session's navigation allows.
  function openQuestion(item: NavItem) {
    setSheetOpen(false);
    setNavNotice(null);
    if (!sequential || item.current) {
      setView("questions");
      if (sequential) return;
      requestAnimationFrame(() => {
        const card = questionsRef.current?.querySelector<HTMLElement>(`[data-question-id="${CSS.escape(item.questionId)}"]`);
        card?.scrollIntoView({ behavior: "smooth", block: "start" });
        card?.focus({ preventScroll: true });
      });
      return;
    }
    if (item.blocked !== null) setNavNotice(item.blocked);
    else void go(item.number - 1);
  }

  async function toggleMark(id: string) {
    const next = !marks[id];
    setNavNotice(null);
    if (!take) {
      const count = Object.values(marks).filter(Boolean).length;
      if (next && session.maxMarked !== null && count >= session.maxMarked) return setNavNotice(markLimitMessage(session.maxMarked));
      return setMarks((m) => ({ ...m, [id]: next }));
    }
    setMarkBusy(true);
    let error: string | null;
    try {
      error = await take.onMark(id, next);
    } catch {
      error = "Couldn't reach the server. Check your connection and try again.";
    }
    setMarkBusy(false);
    if (error) setNavNotice(error);
    else setMarks((m) => ({ ...m, [id]: next }));
  }

  // The countdowns run to the server's deadlines; at zero the answers are handed in, or the next question comes.
  useEffect(() => {
    if (!take || stage !== "taking" || (deadline === null && qDeadline === null)) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [take, stage, deadline, qDeadline]);
  useEffect(() => {
    if (take && stage === "taking" && secondsLeft === 0 && !finalizing.current) void submitRef.current(true);
  }, [take, stage, secondsLeft]);
  // Retried every second (`now`) until the server, whose clock may be a moment behind, has moved on.
  useEffect(() => {
    if (!take || stage !== "taking" || qSecondsLeft !== 0 || finalizing.current) return;
    if (isLast) void submitRef.current(true);
    else void timeUpRef.current();
  }, [take, stage, qSecondsLeft, isLast, qDeadline, now]);

  async function start() {
    if (!take) {
      setPreviewStage("taking");
      return;
    }
    if (rules.blockSecondScreen && hasSecondScreen()) {
      setStartError("Disconnect your second monitor (or set your display to show on one screen only), then try again.");
      return;
    }
    if (session.roomPasswordRequired && roomPassword.trim() === "") {
      setStartError("Type the room password your teacher gave you.");
      return;
    }
    setStartError(null);
    fullscreen.enter();
    if (rules.clearClipboardOnStart) clearClipboard();
    setStarting(true);
    let error: string | null;
    try {
      error = await take.onStart(roomPassword);
    } catch {
      error = "Couldn't reach the server. Check your connection and try again.";
    }
    if (error) {
      setStarting(false);
      setStartError(error);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    }
  }

  if (stage === "intro") {
    return (
      <IntroScreen
        paper={paper}
        classes={classes}
        taking={taking}
        kind={kind}
        assetUrls={assetUrls}
        roomPassword={roomPassword}
        onRoomPassword={setRoomPassword}
        startError={startError}
        starting={starting}
        noQuestions={questions.length === 0}
        onStart={start}
      />
    );
  }

  if (stage === "done") {
    return (
      <Card className="mx-auto max-w-2xl p-6 text-center">
        <p className="font-medium">End of the preview</p>
        <p className="mt-1 text-sm text-muted">Nothing was saved or sent.</p>
        <Button
          variant="secondary"
          className="mt-4"
          onClick={() => {
            setAnswers({});
            setPreviewStage("intro");
          }}
        >
          <RotateCcw className="size-4" aria-hidden /> Try again
        </Button>
      </Card>
    );
  }

  const openReview = () => {
    setSheetOpen(false);
    setNavNotice(null);
    setView("review");
  };
  const overview = <QuestionOverview items={items} marking={marking} onOpen={openQuestion} onReview={openReview} />;
  // One question at a time, on a question they went back to: the way on is the furthest question reached.
  const backToFurthest = progress !== null && session.navigation !== "free" && progress.index < progress.furthest;
  const nextBlocked = progress !== null && !isLast && !backToFurthest ? refusal(progress.index + 1) : null;
  const hints = [
    nextBlocked,
    session.navigation === "marked_only" &&
      (backToFurthest
        ? "If you leave this question without its mark, you can't come back to it."
        : "Once you move on, you can only come back to questions marked for review."),
    session.navigation === "forward_only" && !isLast && "You can't go back to a question once you move on.",
  ].filter((x): x is string => !!x);
  return (
    <NavigatorLayout overview={overview} panelOpen={panelOpen} sheetOpen={sheetOpen} onCloseSheet={closeSheet}>
      {guard.secondScreen && <SecondScreenOverlay kind={kind} timerRunning={secondsLeft !== null} />}

      {!guard.secondScreen && fullscreen.canFullscreen && !fullscreen.isFullscreen && !fullscreen.refused && (
        <FullscreenOverlay kind={kind} timerRunning={secondsLeft !== null} chancesText={chancesText} onEnter={fullscreen.enter} />
      )}

      <ExamHeader
        title={quiz.title}
        items={items}
        marking={marking}
        answered={answered}
        position={sequential ? `Question ${(progress?.index ?? 0) + 1} of ${paper.questionCount} · ` : ""}
        panelOpen={panelOpen}
        onOpenSheet={() => setSheetOpen(true)}
        onTogglePanel={() => setPanelOpen((open) => !open)}
        saveState={take ? saving.saveState : null}
        secondsLeft={secondsLeft}
        qSecondsLeft={qSecondsLeft}
      />

      {take && rules.watermark && <Watermark text={take.watermark} />}

      {guard.notice && (
        <GuardNotice
          notice={guard.notice}
          kind={kind}
          autoSubmitAfter={rules.autoSubmitAfter}
          timesAway={guard.timesAway}
          chancesText={chancesText}
          onDismiss={guard.dismissNotice}
        />
      )}

      {navNotice && view === "questions" && <NavNotice message={navNotice} onDismiss={() => setNavNotice(null)} />}

      {view === "review" && (
        <ReviewScreen
          items={items}
          marking={marking}
          notice={navNotice}
          onOpen={openQuestion}
          onBack={() => {
            setNavNotice(null);
            setView("questions");
          }}
        >
          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border pt-4">
            {answered < items.length && (
              <span className="text-sm text-muted">{items.length - answered} unanswered</span>
            )}
            <Button onClick={() => submit()} disabled={submitting}>
              {submitting ? "Submitting…" : take ? `Submit ${kind}` : "Finish preview"}
            </Button>
          </div>
        </ReviewScreen>
      )}

      {/* Question text can't be selected when copying is blocked; answer boxes still work. Hidden, not removed, on
          the review screen: drawings and unsaved typing stay as they are. */}
      <div
        ref={questionsRef}
        className={clsx(
          "space-y-6",
          view === "review" && "hidden",
          take &&
            rules.blockCopy &&
            "select-none [&_.cm-content]:select-text [&_input]:select-text [&_textarea]:select-text",
        )}
      >
        <QuestionParts
          parts={paper.parts}
          firstNumber={(progress?.index ?? 0) + 1}
          assetUrls={assetUrls}
          answers={answers}
          marks={marks}
          showMarkToggle={marking && (!take || !!attempt)}
          markBusy={markBusy}
          onToggleMark={(id) => void toggleMark(id)}
          onAnswer={(q, v) => {
            if (take && attempt && typedTypes.has(q.type)) logTyped(typing.current, q.id, attempt.startedAt, answers[q.id], v);
            set(q.id, v);
          }}
          runOnServer={take?.runCode}
          onEdit={take && attempt ? (id) => (edits) => logEdits(typing.current, id, attempt.startedAt, edits) : undefined}
          uploads={!!take}
          registerDrawing={registerDrawing}
        />
      </div>

      <NavFooter
        hidden={view === "review"}
        progress={progress}
        navigation={session.navigation}
        isLast={isLast}
        backToFurthest={backToFurthest}
        nextBlocked={nextBlocked}
        unanswered={!sequential ? items.length - answered : 0}
        moving={moving}
        onGo={(index) => void go(index)}
        onReview={openReview}
      />
      {hints.length > 0 && view === "questions" && <p className="mt-2 text-right text-xs text-muted">{hints.join(" ")}</p>}

      {lostLink && (
        <p role="alert" className="mt-3 rounded-lg bg-danger-soft p-3 text-right text-sm text-danger">
          {lostLink}
        </p>
      )}
      {submitError && (
        <p role="alert" className="mt-3 rounded-lg bg-danger-soft p-3 text-right text-sm text-danger">
          {submitError}
        </p>
      )}
    </NavigatorLayout>
  );
}
