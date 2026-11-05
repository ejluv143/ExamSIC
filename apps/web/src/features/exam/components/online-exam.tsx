"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { RotateCcw, Send } from "lucide-react";
import { modeLabel } from "@examinus/copy/modes";
import type { Paper } from "@examinus/contract/attempt";
import type { AnswerValue, IntegrityEvent } from "@examinus/domain/quiz";
import type { Class } from "@/features/classes/types";
import { drawingAssetIds, parseDrawingAnswer } from "@examinus/domain/drawing";
import { kindOf } from "@examinus/domain/kinds";
import { useAttemptLink } from "@examinus/taking/attempt-link";
import type { LeaveOutcome } from "@examinus/taking/take-flow";
import { useTakeFlow } from "@examinus/taking/use-take-flow";
import { buildNavItems, type NavItem } from "@examinus/taking/nav-items";
import { logEdits, logTyped, typedTypes } from "@examinus/taking/typing";
import type { Answers } from "@examinus/taking/types";
import { clearClipboard, useIntegrity, Watermark } from "./exam-integrity";
import { useAssetUrls } from "@/features/assets/use-asset-urls";
import { leaveFullscreen } from "@/lib/fullscreen";
import { onPageWake } from "@/lib/platform/web-platform";
import { hasSecondScreen } from "@/lib/platform/web-sensors";
import { NavigatorLayout, QuestionOverview, ReviewScreen } from "./question-navigator";
import { Button, Card } from "@/components/ui";
import { ExamHeader } from "./online-exam/header";
import { IntroScreen } from "./online-exam/intro-screen";
import { NavFooter } from "./online-exam/nav-footer";
import type { WebTakeMode } from "./online-exam/types";
import { GuardNotice, NavNotice } from "./online-exam/notices";
import { FullscreenOverlay, SecondScreenOverlay } from "./online-exam/overlays";
import { QuestionParts } from "./online-exam/question-parts";
import { useFullscreen } from "./online-exam/use-fullscreen";
import { useTimeSpent } from "./online-exam/use-time-spent";

// The exam as a student takes it online (with `take`), or as a read-only preview where answers stay here.
export function OnlineExam({ paper, classes, take }: { paper: Paper; classes: Class[]; take?: WebTakeMode }) {
  const { session, quiz, attempt } = paper;
  const rules = session.integrity;
  const kind = modeLabel(session.mode).toLowerCase();
  const questions = paper.parts.flatMap((part) => part.questions);

  const [previewStage, setPreviewStage] = useState<"intro" | "taking" | "done">("intro");
  const stage = take ? (attempt ? "taking" : "intro") : previewStage;
  const taking = !!take;
  const [answers, setAnswers] = useState<Answers>(() => ({ ...paper.answers }));
  const drawingPictures = questions.flatMap((q) =>
    kindOf(q).answerPictures ? drawingAssetIds(parseDrawingAnswer(answers[q.id])) : [],
  );
  // Signed picture links expire after ten minutes; this keeps them fresh and fetches those of new photos.
  const { urls: assetUrls } = useAssetUrls(paper.assetUrls, drawingPictures);
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

  const { questionsRef, timeSpentRef } = useTimeSpent({
    active: taking && stage === "taking",
    servedKey: questions.map((q) => q.id).join(","),
  });
  const { flow, state } = useTakeFlow({
    deps: {
      take,
      attemptId: attempt?.id,
      unanswered: items.length - answered,
      marks,
      maxMarked: session.maxMarked,
      questionId: questions[0]?.id,
      questionTimeUp: qSecondsLeft === 0,
      timeSpent: (id) => timeSpentRef.current(id),
    },
    answers: paper.answers,
    typing: paper.typing,
  });
  const { starting, startError, submitting, submitError, moving, markBusy, lateNotice } = state;
  const paperRef = useRef(paper);
  const guard = useIntegrity({
    active: taking && stage === "taking",
    settings: rules,
    needsFullscreen: fullscreen.enforced,
    initial: noEvents,
    onLimit: (events) => void flow.submit({ forced: true, events }),
  });
  useEffect(() => {
    flow.bindEvents(guard);
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
    flow.merge(paperRef.current.answers, paperRef.current.typing);
  }, [servedIndex, flow]);
  useAttemptLink({ active: taking && stage === "taking", flow, onRefused: setLostLink, onWake: onPageWake });

  function set(id: string, v: AnswerValue) {
    setAnswers((prev) => ({ ...prev, [id]: v }));
    flow.answer(id, v);
  }

  // Unanswered questions ask first.
  async function submit() {
    if (!take) {
      setPreviewStage("done");
      return;
    }
    const outcome = await flow.submit();
    if (outcome.status !== "confirm") return;
    if (!guard.withoutTracking(() => window.confirm(outcome.message))) return;
    await flow.submit({ confirmed: true });
  }

  // The result of a move to another question (or the time running out on this one).
  function moved(outcome: LeaveOutcome | null) {
    if (outcome === null || outcome.status === "busy") return;
    if (outcome.status === "drawing") return setLostLink(outcome.error);
    setNavNotice(outcome.status === "refused" ? outcome.error : null);
    if (outcome.status === "moved") setView("questions");
  }
  const go = async (index: number) => moved(await flow.goTo(index));

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
    const error = await flow.mark(id, next);
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
    if (take && stage === "taking" && secondsLeft === 0) void flow.deadlineReached();
  }, [take, stage, secondsLeft, flow]);
  // Retried every second (`now`) until the server, whose clock may be a moment behind, has moved on.
  useEffect(() => {
    if (!take || stage !== "taking" || qSecondsLeft !== 0) return;
    void flow.questionTimeUp(isLast).then(moved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [take, stage, qSecondsLeft, isLast, qDeadline, now]);

  async function start() {
    if (!take) {
      setPreviewStage("taking");
      return;
    }
    const error = await flow.start({
      roomPassword,
      passwordRequired: session.roomPasswordRequired,
      check: () =>
        rules.blockSecondScreen && hasSecondScreen()
          ? "Disconnect your second monitor (or set your display to show on one screen only), then try again."
          : null,
      prepare: () => {
        fullscreen.enter();
        if (rules.clearClipboardOnStart) clearClipboard();
      },
    });
    if (error) leaveFullscreen();
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

      {!guard.secondScreen && fullscreen.enforced && !fullscreen.isFullscreen && (
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
        saveState={take ? state.saveState : null}
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
            <Button variant="success" onClick={() => void submit()} disabled={submitting}>
              <Send className="size-4" aria-hidden /> {submitting ? "Submitting…" : take ? `Submit ${kind}` : "Finish preview"}
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
            if (take && attempt && typedTypes.has(q.type)) logTyped(flow.typing, q.id, attempt.startedAt, answers[q.id], v);
            set(q.id, v);
          }}
          runOnServer={take?.runCode}
          onEdit={take && attempt ? (id) => (edits) => logEdits(flow.typing, id, attempt.startedAt, edits) : undefined}
          uploads={!!take}
          registerDrawing={flow.registerDrawing}
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
      {lateNotice && (
        <p role="alert" className="mt-3 rounded-lg bg-danger-soft p-3 text-right text-sm text-danger">
          {lateNotice}
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
