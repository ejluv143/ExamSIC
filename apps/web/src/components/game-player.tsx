"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import clsx from "clsx";
import { ArrowDown, ArrowUp, Check, Flame, Pencil, Trophy, X } from "lucide-react";
import type { GameView } from "@examinus/contract/game";
import type { AnswerValue } from "@examinus/domain/quiz";
import { Button, Card } from "@/components/ui";
import { AvatarEditor, AvatarImage } from "@/components/avatar";
import { Dialog } from "@/components/dialog";
import { FullscreenToggle } from "@/components/fullscreen-toggle";
import { Markdown } from "@/components/markdown";
import { AnswerInput } from "@/components/online-exam";
import type { DrawingFinalizer } from "@/components/answer-inputs";
import { answerGameAction, answerRescueAction, joinGameAction, nextGameAction } from "@/lib/game/actions";
import { playCorrect, playCountdown, playFanfare, playStreak, unlockAudio } from "@/lib/game/sounds";
import { ThemeMenu } from "@/components/theme-menu";
import { choiceStyles, Confetti, CountdownBar, CountUp, Leaderboard, Podium, StreakFire, useCountUp, useGameView, useRemainingMs } from "./game-parts";
import { useRoundMs, TeamPodium } from "./relay-parts";
import { RelayPlayerLobby, RelayTeamPanel, RescueList, RetryButton, TeamDebrief } from "./relay-player";

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
  const roundMs = useRoundMs(stamped);
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
        <JoinAgain sessionId={sessionId} />
      </Centered>
    );
  else screen = <Playing view={view} remainingMs={remaining} roundMs={roundMs} sessionId={sessionId} resultsHref={resultsHref} />;

  // The game covers the whole window (no navigation around it), and can go full screen on the device. Light or dark
  // follows the Appearance menu, like the rest of the app.
  return (
    <div className="fixed inset-0 z-40 flex flex-col overflow-auto bg-background text-foreground" data-testid="player" onPointerDown={unlockAudio}>
      <div className="flex items-center justify-between gap-2 px-4 py-2 text-sm">
        <Link href={homeHref} className="text-muted hover:underline">
          {homeHref === "/join" ? "Leave" : "Exit"}
        </Link>
        {status !== "live" && joined && <span className="text-amber-600 dark:text-amber-400">{status === "closed" ? "Disconnected" : "Connecting…"}</span>}
        <div className="flex items-center gap-2">
          <ThemeMenu placement="header" />
          <FullscreenToggle />
        </div>
      </div>
      <div className="flex flex-1 flex-col px-4 pb-6">{screen}</div>
    </div>
  );
}

// After a removal, the teacher may let the player back in: joining again takes a new seat (the old points are gone).
function JoinAgain({ sessionId }: { sessionId: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="mt-4 space-y-2">
      <Button
        disabled={pending}
        onClick={() =>
          start(async () => {
            const result = await joinGameAction(sessionId);
            setError("error" in result ? result.error : null);
          })
        }
      >
        {pending ? "Joining…" : "Join again"}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

// Every screen fills the window below the top bar: an optional header, then one card taking the rest.
function Stage({ header, className, children, ...rest }: { header?: React.ReactNode; className?: string; children: React.ReactNode; "data-testid"?: string }) {
  return (
    <div className="flex w-full flex-1 flex-col">
      {header}
      <Card className={clsx("flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center sm:p-10", className)} {...rest}>
        {children}
      </Card>
    </div>
  );
}

function Centered({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <Stage>
      <h1 className="text-2xl font-semibold sm:text-3xl">{title}</h1>
      {children && <div>{children}</div>}
    </Stage>
  );
}

function Playing({ view, remainingMs, roundMs, sessionId, resultsHref }: { view: GameView; remainingMs: number | null; roundMs: number | null; sessionId: string; resultsHref: string }) {
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

  // A right answer chimes once when its result shows (not again after a reconnect resends the same reveal), with a
  // power-up on top when it extends a streak.
  const chimed = useRef<number | null>(null);
  const gotItRight = view.phase === "reveal" && me.last?.correct === true;
  useEffect(() => {
    if (!gotItRight || chimed.current === view.questionIndex) return;
    chimed.current = view.questionIndex;
    playCorrect(me.streak);
    if (me.streak >= 2) playStreak(me.streak);
  }, [gotItRight, view.questionIndex, me.streak]);

  // Trumpets play once when the final results come up.
  const fanfared = useRef(false);
  const ended = view.phase === "ended";
  useEffect(() => {
    if (!ended || fanfared.current) return;
    fanfared.current = true;
    playFanfare();
  }, [ended]);

  // The last ten seconds tick, once per second, until the player answers (or the teacher pauses).
  const secondsLeft = remainingMs === null ? null : Math.ceil(remainingMs / 1000);
  const ticking = view.phase === "question" && !me.answered && !view.paused && secondsLeft !== null && secondsLeft >= 1 && secondsLeft <= 10;
  const ticked = useRef<string | null>(null);
  useEffect(() => {
    const key = `${view.questionIndex}:${secondsLeft}`;
    if (!ticking || ticked.current === key) return;
    ticked.current = key;
    playCountdown(secondsLeft!);
  }, [ticking, view.questionIndex, secondsLeft]);

  // The player's place when each question opened, so the leaderboard after it can move them from there. In
  // sessionStorage, so a reload mid-game keeps it. The first sighting per question wins: in a student-paced game
  // the rank keeps moving while others answer.
  const rankKey = `examinus.game-rank.${sessionId}`;
  useEffect(() => {
    if (view.phase !== "question") return;
    const saved = JSON.parse(sessionStorage.getItem(rankKey) ?? "null") as { index: number; rank: number } | null;
    if (saved?.index !== view.questionIndex) sessionStorage.setItem(rankKey, JSON.stringify({ index: view.questionIndex, rank: me.rank }));
  }, [rankKey, view.phase, view.questionIndex, me.rank]);

  function submit(answer: AnswerValue) {
    if (!q) return;
    start(async () => {
      for (const finalize of finalizers.current.values()) await finalize();
      // A teammate's question claimed for rescue is answered through its own call; the owner's answer is untouched.
      const rescuing = view.relay?.team?.rescuing === q.id;
      const result = rescuing ? await answerRescueAction(sessionId, q.id, answer) : await answerGameAction(sessionId, q.id, answer);
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
      <Stage header={header} className="animate-rise">
        <div className="flex flex-col items-center gap-3">
          <AvatarImage avatar={me.avatar} size={160} alt="Your avatar" className="animate-bob" />
          <Button variant="secondary" onClick={() => setEditingAvatar(true)}>
            <Pencil className="size-4" aria-hidden /> Customize avatar
          </Button>
        </div>
        <h1 className="text-3xl font-semibold sm:text-4xl">{view.title}</h1>
        {view.relay && view.status !== "running" ? (
          <>
            <p className="animate-pop-in text-2xl font-medium text-primary">You&apos;re in!</p>
            <p className="text-base text-muted sm:text-lg" role="status">
              {view.status === "scheduled" ? "Waiting for your teacher to open the game." : "Waiting for your teacher to start the relay."}
            </p>
            {view.status === "lobby" && <RelayPlayerLobby relay={view.relay} sessionId={sessionId} />}
          </>
        ) : view.pacing === "student" && view.status === "running" ? (
          <>
            <p className="text-base text-muted sm:text-lg">{view.questionCount} questions, {view.questionSeconds} seconds each. Faster correct answers earn more.</p>
            {view.relay?.team && (
              <div className="w-full max-w-3xl">
                <RelayTeamPanel relay={view.relay} sessionId={sessionId} meAttemptId={me.attemptId} meName={me.name} roundMs={roundMs} />
              </div>
            )}
            <Button className="w-full max-w-md py-4 text-lg" disabled={pending} onClick={next}>
              Play
            </Button>
          </>
        ) : (
          <>
            <p className="animate-pop-in text-2xl font-medium text-primary">You&apos;re in!</p>
            <p className="text-base text-muted sm:text-lg" role="status">
              {view.status === "scheduled" ? "Waiting for your teacher to open the game." : "Waiting for your teacher to start. Look at the big screen."}
            </p>
          </>
        )}
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <Dialog open={editingAvatar} onClose={() => setEditingAvatar(false)} title="Your avatar" description="Everyone in the game sees it." size="lg">
          <AvatarEditor initial={me.avatar} onSaved={() => setEditingAvatar(false)} onCancel={() => setEditingAvatar(false)} />
        </Dialog>
      </Stage>
    );

  // The question takes the whole screen: the prompt on top, the answers filling the rest.
  if (view.phase === "question" && q)
    return (
      <div className="flex w-full flex-1 flex-col">
        {header}
        <CountdownBar remainingMs={remainingMs} totalSeconds={view.questionSeconds} />
        {view.paused && (
          <p className="mt-2 text-center text-lg font-semibold text-amber-600 dark:text-amber-400" role="status">
            Paused by your teacher
          </p>
        )}
        {view.relay?.team && (
          <div className="mt-4">
            <RelayTeamPanel relay={view.relay} sessionId={sessionId} meAttemptId={me.attemptId} meName={me.name} roundMs={roundMs} />
          </div>
        )}
        <Card key={q.id} className="animate-rise mt-4 flex flex-1 flex-col gap-4 p-5 sm:p-8" data-testid="player-question">
          <p className="text-sm text-muted">
            Question {view.questionIndex + 1} of {view.questionCount}
          </p>
          {view.relay?.team?.rescuing === q.id && <p className="text-sm font-medium text-primary">Rescue: you are answering a teammate&apos;s question.</p>}
          {q.type !== "blank" && (
            <Markdown className="text-xl font-semibold sm:text-2xl lg:text-3xl" assetUrls={view.assetUrls}>
              {q.prompt}
            </Markdown>
          )}
          {tapToAnswer && q.type === "multiple_choice" ? (
            <div className="grid flex-1 auto-rows-fr gap-3 sm:grid-cols-2">
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
                    "animate-pop-in min-h-16 rounded-xl px-5 py-4 text-left text-lg font-semibold transition-transform active:scale-95 disabled:opacity-50 sm:text-xl",
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
            <div className="grid flex-1 auto-rows-fr grid-cols-2 gap-3">
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
                    "animate-pop-in min-h-20 rounded-xl text-2xl font-bold transition-transform active:scale-95 disabled:opacity-50 sm:text-3xl",
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
              <div className="flex-1">
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
              </div>
              <Button className="w-full py-3 text-base" disabled={locked || pending || value === undefined} onClick={() => submit(value ?? null)}>
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
      <>
        {right && <Confetti pieces={40} />}
        <Stage
          header={header}
          className={clsx(
            wrong ? "animate-shake" : "animate-pop-in",
            last?.answered && last.correct !== null ? (right ? "bg-emerald-50! dark:bg-emerald-950!" : "bg-red-50! dark:bg-red-950!") : "",
          )}
          data-testid="player-reveal"
        >
          {last?.correct === null ? (
            <h1 className="text-4xl font-bold sm:text-5xl">Answer received</h1>
          ) : !last?.answered ? (
            <h1 className="text-4xl font-bold sm:text-5xl">Time&apos;s up</h1>
          ) : right ? (
            <h1 className="flex items-center justify-center gap-3 text-4xl font-bold text-emerald-600 sm:text-5xl dark:text-emerald-400">
              <Check className="size-10" aria-hidden /> Correct
            </h1>
          ) : (
            <h1 className="flex items-center justify-center gap-3 text-4xl font-bold text-red-600 sm:text-5xl dark:text-red-400">
              <X className="size-10" aria-hidden /> Not quite
            </h1>
          )}
          <p className="text-6xl font-black tabular-nums sm:text-7xl" aria-label="Points earned">
            <CountUp value={last?.earned ?? 0} from={0} prefix="+" />
          </p>
          {right && me.streak >= 2 && <StreakFire streak={me.streak} />}
          {view.reveal?.answer && !right && last?.correct !== null && (
            <p className="text-lg text-muted">
              Answer: <span className="font-medium text-foreground">{view.reveal.answer}</span>
            </p>
          )}
          <p className="text-lg text-muted">
            You&apos;re #{me.rank} with {me.points.toLocaleString()} points
          </p>
          {view.relay?.team && <RetryButton team={view.relay.team} sessionId={sessionId} />}
          {view.pacing === "student" ? (
            <Button className="w-full max-w-md py-4 text-lg" disabled={pending} onClick={next}>
              {view.questionIndex + 1 >= view.questionCount ? "Finish" : "Next question"}
            </Button>
          ) : (
            <p className="text-lg text-muted">Look at the big screen.</p>
          )}
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          {view.relay?.team && (
            <div className="w-full max-w-3xl">
              <RelayTeamPanel relay={view.relay} sessionId={sessionId} meAttemptId={me.attemptId} meName={me.name} roundMs={roundMs} retryButton={false} />
            </div>
          )}
        </Stage>
      </>
    );
  }

  // A relay player who finished their own questions waits with the team: its board, the rescue list, the debrief.
  if (view.phase === "leaderboard" && view.relay) {
    const relay = view.relay;
    return (
      <Stage header={header} className="animate-rise justify-start">
        <h1 className="text-3xl font-bold sm:text-4xl">{relay.team?.finished ? "Your team is done" : "You finished your questions"}</h1>
        {!relay.team?.finished && <p className="text-lg text-muted">Your team is still working on the password.</p>}
        {relay.team && (
          <div className="w-full max-w-3xl space-y-4">
            <RelayTeamPanel relay={relay} sessionId={sessionId} meAttemptId={me.attemptId} meName={me.name} roundMs={roundMs} />
            <RescueList team={relay.team} sessionId={sessionId} />
            <TeamDebrief team={relay.team} />
          </div>
        )}
      </Stage>
    );
  }

  if (view.phase === "leaderboard") {
    const saved = JSON.parse(sessionStorage.getItem(rankKey) ?? "null") as { index: number; rank: number } | null;
    const rankBefore = saved?.index === view.questionIndex ? saved.rank : null;
    return (
      <Stage header={header} className="animate-rise">
        <h1 className="text-3xl font-bold sm:text-4xl">{view.finished ? "You finished!" : "Leaderboard"}</h1>
        {view.finished && <p className="text-lg text-muted">Waiting for the others.</p>}
        <Placement from={rankBefore} to={me.rank} />
        <div className="w-full text-left">
          <Leaderboard rows={view.leaderboard.slice(0, 5)} meId={me.attemptId} meFrom={rankBefore} historyKey={sessionId} />
        </div>
        {me.rank > 5 && <p className="text-lg text-muted">{me.points.toLocaleString()} points</p>}
      </Stage>
    );
  }

  if (view.relay) {
    const relay = view.relay;
    const myTeam = relay.teams.find((t) => t.id === relay.myTeamId);
    return (
      <>
        {myTeam?.solvedAt && <Confetti />}
        <Stage header={header} className="justify-start">
          <h1 className="animate-pop-in text-3xl font-bold sm:text-4xl">Final team results</h1>
          <div className="w-full">
            <TeamPodium teams={relay.teams} />
          </div>
          {myTeam && (
            <p className="text-xl font-semibold" data-testid="final-rank">
              Team {myTeam.name} finished #{myTeam.rank} with {myTeam.points.toLocaleString()} points
            </p>
          )}
          {relay.team && (
            <div className="w-full max-w-3xl space-y-4">
              <RelayTeamPanel relay={relay} sessionId={sessionId} meAttemptId={me.attemptId} meName={me.name} roundMs={roundMs} />
              <TeamDebrief team={relay.team} />
            </div>
          )}
          <Link href={resultsHref} className="text-base text-primary hover:underline">
            Full standings
          </Link>
        </Stage>
      </>
    );
  }

  // ended
  return (
    <>
      {me.rank <= 3 && <Confetti />}
      <Stage header={header} className="justify-start">
        <h1 className="animate-pop-in text-3xl font-bold sm:text-4xl">Final results</h1>
        <div className="w-full">
          <Podium rows={view.leaderboard.slice(0, 3)} />
        </div>
        <p className="animate-rise text-xl font-semibold" style={{ animationDelay: "2s" }} data-testid="final-rank">
          You finished #{me.rank} with {me.points.toLocaleString()} points
        </p>
        <div className="w-full text-left">
          <Leaderboard rows={view.leaderboard.slice(0, 10)} meId={me.attemptId} historyKey={sessionId} />
        </div>
        <Link href={resultsHref} className="text-base text-primary hover:underline">
          Full standings
        </Link>
      </Stage>
    </>
  );
}

// The player's place, counting from where they were before the question to where they are now, with how far they
// moved.
function Placement({ from, to }: { from: number | null; to: number }) {
  const shown = useCountUp(to, from ?? to, 1400);
  const moved = from === null ? 0 : from - to;
  return (
    <div className="flex flex-col items-center gap-2" data-testid="player-placement">
      <p className="text-sm font-medium tracking-wide text-muted uppercase">Your place</p>
      <p key={shown} className={clsx("text-6xl font-black tabular-nums sm:text-7xl", shown !== to && "animate-tick")} aria-label={`Place ${to}`}>
        #{shown}
      </p>
      {from !== null && (
        <p
          className={clsx(
            "animate-pop-in flex items-center gap-1 rounded-full px-3 py-1 text-sm font-semibold",
            moved > 0 && "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
            moved < 0 && "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
            moved === 0 && "bg-surface-muted text-muted",
          )}
          style={{ animationDelay: "1.6s" }}
        >
          {moved > 0 ? <ArrowUp className="size-4" aria-hidden /> : moved < 0 ? <ArrowDown className="size-4" aria-hidden /> : null}
          {moved > 0 ? `Up ${moved} ${moved === 1 ? "place" : "places"}` : moved < 0 ? `Down ${-moved} ${moved === -1 ? "place" : "places"}` : `Held #${to}`}
        </p>
      )}
    </div>
  );
}
