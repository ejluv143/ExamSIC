"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Check, Flame, Trophy, X } from "lucide-react";
import type { AnswerValue, GameView } from "@examora/contract";
import { Button, Card } from "@/components/ui";
import { Markdown } from "@/components/markdown";
import { AnswerInput } from "@/components/online-exam";
import type { DrawingFinalizer } from "@/components/answer-inputs";
import { answerGameAction, joinGameAction, nextGameAction } from "@/lib/game/actions";
import { choiceStyles, CountdownBar, Leaderboard, Podium, useGameView, useRemainingMs } from "./game-parts";

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

  if (!joined)
    return (
      <Centered title="Joining the game…">
        <p className="text-sm text-muted" role="status">
          {joinError ?? "One moment."}
        </p>
      </Centered>
    );
  if (status === "closed" && !view)
    return (
      <Centered title="You're not in this game">
        <p className="text-sm text-muted">You may have been removed by your teacher, or the game doesn&apos;t exist any more.</p>
        <Link href={homeHref} className="mt-3 inline-block text-sm text-primary hover:underline">
          {homeHref === "/join" ? "Join another game" : "Back to the dashboard"}
        </Link>
      </Centered>
    );
  if (!view) return <Centered title="Connecting…" />;
  if (!view.me)
    return (
      <Centered title="You're not in this game">
        <p className="text-sm text-muted">Your teacher removed you from the game.</p>
      </Centered>
    );
  return <Playing view={view} remainingMs={remaining} sessionId={sessionId} resultsHref={resultsHref} />;
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
  const q = view.question;
  const value = q && draft?.id === q.id ? draft.value : undefined;
  const locked = me.answered || remainingMs === 0;
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
      <span className="font-semibold">{me.name}</span>
      <span className="ml-auto flex items-center gap-1 tabular-nums" aria-label="Points">
        <Trophy className="size-4 text-amber-500" aria-hidden /> {me.points.toLocaleString()}
      </span>
      {me.streak >= 2 && (
        <span className="flex items-center gap-1 text-orange-500" aria-label={`Streak of ${me.streak}`}>
          <Flame className="size-4" aria-hidden /> {me.streak}
        </span>
      )}
    </div>
  );

  if (view.phase === "lobby")
    return (
      <Card className="mx-auto max-w-lg p-8 text-center">
        {header}
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
            <p className="mt-2 text-lg font-medium text-primary">You&apos;re in!</p>
            <p className="mt-1 text-sm text-muted" role="status">
              {view.status === "scheduled" ? "Waiting for your teacher to open the game." : "Waiting for your teacher to start. Look at the big screen."}
            </p>
          </>
        )}
        {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
      </Card>
    );

  if (view.phase === "question" && q)
    return (
      <div className="mx-auto max-w-2xl">
        {header}
        <CountdownBar remainingMs={remainingMs} totalSeconds={view.questionSeconds} />
        <Card className="mt-4 space-y-4 p-5" data-testid="player-question">
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
                    "min-h-16 rounded-xl px-4 py-3 text-left text-base font-semibold disabled:opacity-50",
                    choiceStyles[i % choiceStyles.length],
                    value === c.id && "ring-4 ring-foreground",
                  )}
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
                  className={clsx("min-h-20 rounded-xl text-lg font-bold disabled:opacity-50", choiceStyles[i], value === v && "ring-4 ring-foreground")}
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
            <p className="text-center text-sm font-medium text-primary" role="status">
              Answer locked in{view.pacing === "teacher" ? ". Wait for the others." : "."}
            </p>
          )}
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        </Card>
      </div>
    );

  if (view.phase === "reveal") {
    const last = me.last;
    const right = last?.correct === true;
    return (
      <div className="mx-auto max-w-lg">
        {header}
        <Card
          className={clsx(
            "p-8 text-center",
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
            {last && last.earned > 0 ? `+${last.earned.toLocaleString()}` : "+0"}
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
        <Card className="space-y-4 p-5">
          <h1 className="text-center text-xl font-bold">{view.finished ? "You finished!" : "Leaderboard"}</h1>
          {view.finished && <p className="text-center text-sm text-muted">Waiting for the others. You&apos;re #{me.rank} so far.</p>}
          <Leaderboard rows={view.leaderboard.slice(0, 5)} meId={me.attemptId} />
          {me.rank > 5 && <p className="text-center text-sm text-muted">You&apos;re #{me.rank} with {me.points.toLocaleString()} points.</p>}
        </Card>
      </div>
    );

  // ended
  return (
    <div className="mx-auto max-w-lg">
      {header}
      <Card className="space-y-5 p-5">
        <h1 className="text-center text-xl font-bold">Final results</h1>
        <Podium rows={view.leaderboard.slice(0, 3)} />
        <p className="text-center text-lg font-semibold" data-testid="final-rank">
          You finished #{me.rank} with {me.points.toLocaleString()} points
        </p>
        <Leaderboard rows={view.leaderboard.slice(0, 10)} meId={me.attemptId} />
        <Link href={resultsHref} className="block text-center text-sm text-primary hover:underline">
          Full standings
        </Link>
      </Card>
    </div>
  );
}
