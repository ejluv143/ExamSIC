"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Check, Flame, Pencil, Trophy, X } from "lucide-react";
import type { AnswerValue, GameView } from "@examinus/contract";
import { Button, Card } from "@/components/ui";
import { AvatarEditor, AvatarImage } from "@/components/avatar";
import { Dialog } from "@/components/dialog";
import { FullscreenToggle } from "@/components/fullscreen-toggle";
import { Markdown } from "@/components/markdown";
import { AnswerInput } from "@/components/online-exam";
import type { DrawingFinalizer } from "@/components/answer-inputs";
import { answerGameAction, joinGameAction, nextGameAction } from "@/lib/game/actions";
import { choiceStyles, Confetti, CountdownBar, CountUp, Leaderboard, Podium, useGameView, useRemainingMs } from "./game-parts";

// The player's screen: waiting in the lobby, the question with its timer, what the answer earned, and the
// standings. Everything shown comes from the server's view; the browser only sends answers.
export function GamePlayer({ sessionId, resultsHref, homeHref = "/student" }: { sessionId: string; resultsHref: string; homeHref?: string }) {
  // Taking a seat is idempotent, so a reload (or a second tab) just comes back. While the teacher hasn't opened
  // the game yet, it asks again every few seconds.
  const [joined, setJoined] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const attempt = async () => {
      const result = await joinGameAction(sessionId);
      if (stop) return;
      if ("error" in result) {
        setJoinError(result.error);
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
  const view = stamped?.view ?? null;

  let screen: React.ReactNode;
  if (!joined)
    screen = (
      <Centered title="Joining the game…">
        <p className="text-sm text-muted" role="status">
          {joinError ?? "One moment."}
        </p>
      </Centered>
    );
  else if (status === "closed" && !view)
    screen = (
      <Centered title="You're not in this game">
        <p className="text-sm text-muted">You may have been removed by your teacher, or the game doesn&apos;t exist any more.</p>
        <Link href={homeHref} className="mt-3 inline-block text-sm text-primary hover:underline">
          {homeHref === "/join" ? "Join another game" : "Back to the dashboard"}
        </Link>
      </Centered>
    );
  else if (!view) screen = <Centered title="Connecting…" />;
  else if (!view.me)
    screen = (
      <Centered title="You're not in this game">
        <p className="text-sm text-muted">Your teacher removed you from the game.</p>
      </Centered>
    );
  else screen = <Playing view={view} remainingMs={remaining} sessionId={sessionId} resultsHref={resultsHref} />;

  // The game covers the whole window (no navigation around it), and can go full screen on the device.
  return (
    <div className="fixed inset-0 z-40 flex flex-col overflow-auto bg-background" data-testid="player">
      <div className="flex items-center justify-between gap-2 px-4 py-2 text-sm">
        <Link href={homeHref} className="text-muted hover:underline">
          {homeHref === "/join" ? "Leave" : "Exit"}
        </Link>
        {status !== "live" && joined && <span className="text-amber-600">{status === "closed" ? "Disconnected" : "Connecting…"}</span>}
        <FullscreenToggle />
      </div>
      <div className="flex-1 px-4 pb-6">{screen}</div>
    </div>
  );
}

function Centered({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <Card className="mx-auto max-w-lg p-8 text-center">
      <h1 className="text-lg font-semibold">{title}</h1>
      <div className="mt-2">{children}</div>
    </Card>
  );
}

function Playing({ view, remainingMs, sessionId, resultsHref }: { view: GameView; remainingMs: number | null; sessionId: string; resultsHref: string }) {
  const me = view.me!;
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ id: string; value: AnswerValue } | null>(null);
  const finalizers = useRef(new Map<string, DrawingFinalizer>());
  const [editingAvatar, setEditingAvatar] = useState(false);
  const q = view.question;
  const value = q && draft?.id === q.id ? draft.value : undefined;
  const locked = me.answered || remainingMs === 0 || view.paused;
  // A single tap answers a choice or true/false question at once.
  const tapToAnswer = q?.type === "true_false" || (q?.type === "multiple_choice" && !q.multipleCorrect);

  function submit(answer: AnswerValue) {
    if (!q) return;
    start(async () => {
      for (const finalize of finalizers.current.values()) await finalize();
      const result = await answerGameAction(sessionId, q.id, answer);
      setError("error" in result ? result.error : null);
    });
  }

  function next() {
    start(async () => {
      const result = await nextGameAction(sessionId);
      setError("error" in result ? result.error : null);
    });
  }

  const header = (
    <div className="mb-4 flex items-center gap-3 text-sm">
      <AvatarImage avatar={me.avatar} size={32} />
      <span className="font-semibold">{me.name}</span>
      <span className="ml-auto flex items-center gap-1 tabular-nums" aria-label="Points">
        <Trophy className="size-4 text-amber-500" aria-hidden /> <CountUp value={me.points} />
      </span>
      {me.streak >= 2 && (
        <span className="animate-pop-in flex items-center gap-1 text-orange-500" aria-label={`Streak of ${me.streak}`}>
          <Flame className="animate-flicker size-4" aria-hidden /> {me.streak}
        </span>
      )}
    </div>
  );

  if (view.phase === "lobby")
    return (
      <Card className="animate-rise mx-auto max-w-lg p-8 text-center">
        {header}
        <div className="mb-4 flex flex-col items-center gap-2">
          <AvatarImage avatar={me.avatar} size={120} alt="Your avatar" className="animate-bob" />
          <Button variant="secondary" onClick={() => setEditingAvatar(true)}>
            <Pencil className="size-4" aria-hidden /> Customize avatar
          </Button>
        </div>
        <h1 className="text-xl font-semibold">{view.title}</h1>
        {view.pacing === "student" && view.status === "running" ? (
          <>
            <p className="mt-2 text-sm text-muted">{view.questionCount} questions, {view.questionSeconds} seconds each. Faster correct answers earn more.</p>
            <Button className="mt-5 w-full py-3 text-base" disabled={pending} onClick={next}>
              Play
            </Button>
          </>
        ) : (
          <>
            <p className="animate-pop-in mt-2 text-lg font-medium text-primary">You&apos;re in!</p>
            <p className="mt-1 text-sm text-muted" role="status">
              {view.status === "scheduled" ? "Waiting for your teacher to open the game." : "Waiting for your teacher to start. Look at the big screen."}
            </p>
          </>
        )}
        {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
        <Dialog open={editingAvatar} onClose={() => setEditingAvatar(false)} title="Your avatar" description="Everyone in the game sees it." size="lg">
          <AvatarEditor initial={me.avatar} onSaved={() => setEditingAvatar(false)} onCancel={() => setEditingAvatar(false)} />
        </Dialog>
      </Card>
    );

  if (view.phase === "question" && q)
    return (
      <div className="mx-auto max-w-2xl">
        {header}
        <CountdownBar remainingMs={remainingMs} totalSeconds={view.questionSeconds} />
        {view.paused && (
          <p className="mt-2 text-center text-lg font-semibold text-amber-600" role="status">
            Paused by your teacher
          </p>
        )}
        <Card key={q.id} className="animate-rise mt-4 space-y-4 p-5" data-testid="player-question">
          <p className="text-xs text-muted">
            Question {view.questionIndex + 1} of {view.questionCount}
          </p>
          {q.type !== "blank" && (
            <Markdown className="text-lg font-semibold" assetUrls={view.assetUrls}>
              {q.prompt}
            </Markdown>
          )}
          {tapToAnswer && q.type === "multiple_choice" ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {q.choices.map((c, i) => (
                <button
                  key={c.id}
                  type="button"
                  disabled={locked || pending}
                  onClick={() => {
                    setDraft({ id: q.id, value: c.id });
                    submit(c.id);
                  }}
                  className={clsx(
                    "animate-pop-in min-h-16 rounded-xl px-4 py-3 text-left text-base font-semibold transition-transform active:scale-95 disabled:opacity-50",
                    choiceStyles[i % choiceStyles.length],
                    value === c.id && "ring-4 ring-foreground",
                  )}
                  style={{ animationDelay: `${0.15 + i * 0.07}s` }}
                >
                  <Markdown inline assetUrls={view.assetUrls}>
                    {c.text || "(image)"}
                  </Markdown>
                </button>
              ))}
            </div>
          ) : tapToAnswer ? (
            <div className="grid grid-cols-2 gap-2">
              {[true, false].map((v, i) => (
                <button
                  key={String(v)}
                  type="button"
                  disabled={locked || pending}
                  onClick={() => {
                    setDraft({ id: q.id, value: v });
                    submit(v);
                  }}
                  className={clsx(
                    "animate-pop-in min-h-20 rounded-xl text-lg font-bold transition-transform active:scale-95 disabled:opacity-50",
                    choiceStyles[i],
                    value === v && "ring-4 ring-foreground",
                  )}
                  style={{ animationDelay: `${0.15 + i * 0.07}s` }}
                >
                  {v ? "True" : "False"}
                </button>
              ))}
            </div>
          ) : (
            <>
              <AnswerInput
                q={q}
                value={value}
                onChange={(v) => setDraft({ id: q.id, value: v })}
                assetUrls={view.assetUrls}
                uploads
                registerDrawing={(id, finalize) => {
                  if (finalize) finalizers.current.set(id, finalize);
                  else finalizers.current.delete(id);
                }}
              />
              <Button className="w-full py-3" disabled={locked || pending || value === undefined} onClick={() => submit(value ?? null)}>
                Lock in answer
              </Button>
            </>
          )}
          {me.answered && (
            <p className="animate-pop-in text-center text-sm font-medium text-primary" role="status">
              Answer locked in{view.pacing === "teacher" ? ". You'll see how you did when time is up." : "."}
            </p>
          )}
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        </Card>
      </div>
    );

  if (view.phase === "reveal") {
    const last = me.last;
    const right = last?.correct === true;
    const wrong = last?.answered === true && last.correct === false;
    return (
      <div className="mx-auto max-w-lg">
        {header}
        {right && <Confetti pieces={40} />}
        <Card
          className={clsx(
            "p-8 text-center",
            wrong ? "animate-shake" : "animate-pop-in",
            last?.answered && last.correct !== null ? (right ? "bg-emerald-50 dark:bg-emerald-950" : "bg-red-50 dark:bg-red-950") : "",
          )}
          data-testid="player-reveal"
        >
          {last?.correct === null ? (
            <h1 className="text-2xl font-bold">Answer received</h1>
          ) : !last?.answered ? (
            <h1 className="text-2xl font-bold">Time&apos;s up</h1>
          ) : right ? (
            <h1 className="flex items-center justify-center gap-2 text-2xl font-bold text-emerald-600">
              <Check className="size-7" aria-hidden /> Correct
            </h1>
          ) : (
            <h1 className="flex items-center justify-center gap-2 text-2xl font-bold text-red-600">
              <X className="size-7" aria-hidden /> Not quite
            </h1>
          )}
          <p className="mt-3 text-4xl font-black tabular-nums" aria-label="Points earned">
            <CountUp value={last?.earned ?? 0} from={0} prefix="+" />
          </p>
          {view.reveal?.answer && !right && last?.correct !== null && (
            <p className="mt-3 text-sm text-muted">
              Answer: <span className="font-medium text-foreground">{view.reveal.answer}</span>
            </p>
          )}
          <p className="mt-4 text-sm text-muted">
            You&apos;re #{me.rank} with {me.points.toLocaleString()} points
          </p>
          {view.pacing === "student" ? (
            <Button className="mt-5 w-full py-3" disabled={pending} onClick={next}>
              {view.questionIndex + 1 >= view.questionCount ? "Finish" : "Next question"}
            </Button>
          ) : (
            <p className="mt-3 text-sm text-muted">Look at the big screen.</p>
          )}
          {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
        </Card>
      </div>
    );
  }

  if (view.phase === "leaderboard")
    return (
      <div className="mx-auto max-w-lg">
        {header}
        <Card className="animate-rise space-y-4 p-5">
          <h1 className="text-center text-xl font-bold">{view.finished ? "You finished!" : "Leaderboard"}</h1>
          {view.finished && <p className="text-center text-sm text-muted">Waiting for the others. You&apos;re #{me.rank} so far.</p>}
          <Leaderboard rows={view.leaderboard.slice(0, 5)} meId={me.attemptId} historyKey={sessionId} />
          {me.rank > 5 && <p className="text-center text-sm text-muted">You&apos;re #{me.rank} with {me.points.toLocaleString()} points.</p>}
        </Card>
      </div>
    );

  // ended
  return (
    <div className="mx-auto max-w-lg">
      {header}
      {me.rank <= 3 && <Confetti />}
      <Card className="space-y-5 p-5">
        <h1 className="animate-pop-in text-center text-xl font-bold">Final results</h1>
        <Podium rows={view.leaderboard.slice(0, 3)} />
        <p className="animate-rise text-center text-lg font-semibold" style={{ animationDelay: "2s" }} data-testid="final-rank">
          You finished #{me.rank} with {me.points.toLocaleString()} points
        </p>
        <Leaderboard rows={view.leaderboard.slice(0, 10)} meId={me.attemptId} historyKey={sessionId} />
        <Link href={resultsHref} className="block text-center text-sm text-primary hover:underline">
          Full standings
        </Link>
      </Card>
    </div>
  );
}
