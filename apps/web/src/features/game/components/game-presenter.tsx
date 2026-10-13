"use client";

import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import clsx from "clsx";
import { Eye, EyeOff, UserCheck, Users, X } from "lucide-react";
import { type GalleryItem, type GameView } from "@examinus/contract/game";
import { parseDrawingAnswer } from "@examinus/domain/drawing";
import { formatJoinKey } from "@examinus/domain/join-key";
import { type StudentQuestion } from "@examinus/domain/question";
import { gameMaxSeconds, gameMinSeconds } from "@examinus/domain/quiz";
import { Button, ButtonDownload, ButtonLink } from "@/components/ui";
import { Select } from "@/components/select";
import { ThemeMenu } from "@/components/theme-menu";
import { AvatarImage } from "@/features/auth/components/avatar";
import { DrawingPicture } from "@/components/drawing-picture";
import { Markdown } from "@/components/markdown";
import {
  advanceGameAction,
  allowRejoinAction,
  endGameAction,
  getGalleryAction,
  goToQuestionAction,
  kickPlayerAction,
  openLobbyAction,
  pauseGameAction,
  resumeGameAction,
  setGameSecondsAction,
  startGameAction,
} from "@/features/game/actions";
import { Buckets, choiceStyles, Confetti, CountdownBar, Leaderboard, Podium, useGameView, useRemainingMs } from "./game-parts";
import { RelayEnded, RelayLobbyBoard, RelayRunning } from "./relay-presenter";
import { useRoundMs } from "./relay-parts";

export type DrawingQuestionRef = { id: string; number: number; prompt: string };

// The projector screen of a game: the join code and players, the question with its timer, how the answers
// split, the leaderboard and the podium; and the teacher's controls. It covers the whole window.
export function GamePresenter({
  sessionId,
  backHref,
  exportHref,
  drawingQuestions,
}: {
  sessionId: string;
  backHref: string;
  exportHref: string;
  drawingQuestions: DrawingQuestionRef[];
}) {
  const { stamped, status } = useGameView(sessionId);
  const remaining = useRemainingMs(stamped);
  const roundMs = useRoundMs(stamped);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // The players panel can be hidden, e.g. before showing the screen to the class.
  const [panelOpen, setPanelOpen] = useState(true);
  const view = stamped?.view ?? null;

  function run(action: () => Promise<{ error: string } | object>) {
    start(async () => {
      const result = await action();
      setError("error" in result ? result.error : null);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-auto bg-background text-foreground" data-testid="presenter">
      <header className="flex items-center gap-4 border-b border-border bg-surface px-6 py-3">
        <p className="min-w-0 flex-1 truncate text-lg font-semibold">{view?.title ?? "Game"}</p>
        {view?.joinCode && view.status !== "ended" && (
          <p className="text-sm text-muted" data-testid="room-key">
            Room <span className="font-mono font-semibold tracking-wider text-foreground">{formatJoinKey(view.joinCode)}</span>
          </p>
        )}
        {view && view.phase !== "lobby" && view.phase !== "ended" && view.pacing === "teacher" && (
          <p className="text-sm text-muted">
            Question {view.questionIndex + 1} of {view.questionCount}
          </p>
        )}
        <button
          type="button"
          onClick={() => setPanelOpen((open) => !open)}
          aria-pressed={panelOpen}
          aria-controls="players-panel"
          title={panelOpen ? "Hide players" : "Show players"}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-muted hover:bg-surface-muted hover:text-foreground"
        >
          <Users className="size-4" aria-hidden /> {view?.playerCount ?? 0}
          <span className="sr-only">{panelOpen ? "Hide players" : "Show players"}</span>
        </button>
        {status !== "live" && <span className="text-sm text-warning">{status === "closed" ? "Disconnected" : "Connecting…"}</span>}
        <ThemeMenu placement="header" />
        <ButtonLink href={backHref} variant="secondary">
          Exit
        </ButtonLink>
      </header>

      <div className="flex flex-1">
        <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-6">
          {!view ? (
            <p className="m-auto text-xl text-muted">Connecting…</p>
          ) : view.phase === "lobby" ? (
            <Lobby view={view} sessionId={sessionId} pending={pending} run={run} />
          ) : view.phase === "ended" ? (
            <Ended view={view} exportHref={exportHref} backHref={backHref} drawingQuestions={drawingQuestions} sessionId={sessionId} />
          ) : view.pacing === "student" ? (
            <StudentPaced view={view} drawingQuestions={drawingQuestions} sessionId={sessionId} roundMs={roundMs} />
          ) : (
            <TeacherPaced view={view} remainingMs={remaining} sessionId={sessionId} />
          )}
        </main>
        {view && panelOpen && view.phase !== "ended" && <PlayersPanel view={view} sessionId={sessionId} pending={pending} run={run} />}
      </div>

      <footer className="flex flex-wrap items-center justify-end gap-3 border-t border-border bg-surface px-6 py-3">
        {error && (
          <p role="alert" className="mr-auto text-sm text-danger">
            {error}
          </p>
        )}
        {view && view.phase !== "ended" && <Controls view={view} sessionId={sessionId} pending={pending} run={run} />}
      </footer>
    </div>
  );
}

// Everyone in the room, whether their screen is connected now, and the teacher's remove / allow back. Beside the
// game in every phase but the podium.
function PlayersPanel({
  view,
  sessionId,
  pending,
  run,
}: {
  view: GameView;
  sessionId: string;
  pending: boolean;
  run: (action: () => Promise<{ error: string } | object>) => void;
}) {
  const online = view.players.filter((p) => p.online).length;
  return (
    <aside
      id="players-panel"
      aria-label="Players"
      className="flex w-72 shrink-0 flex-col gap-4 border-l border-border bg-surface px-4 py-5"
    >
      <div>
        <h2 className="font-semibold">Players</h2>
        <p className="text-xs text-muted" data-testid="players-online">
          {online} of {view.players.length} online
        </p>
      </div>
      {view.players.length === 0 ? (
        <p className="text-sm text-muted">Nobody has joined yet.</p>
      ) : (
        <ul className="space-y-1">
          {view.players.map((p) => (
            <li key={p.attemptId} className="flex items-center gap-2 rounded-md px-1 py-1 hover:bg-surface-muted">
              <AvatarImage avatar={p.avatar} size={28} />
              <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
              <span
                className={clsx("flex items-center gap-1 text-xs", p.online ? "text-success" : "text-muted")}
                title={p.online ? "Their screen is connected" : "Their screen isn't connected"}
              >
                <span className={clsx("size-2 rounded-full", p.online ? "bg-success" : "bg-border")} aria-hidden />
                {p.online ? "Live" : "Offline"}
              </span>
              <button
                type="button"
                aria-label={`Remove ${p.name}`}
                title="Remove from the game"
                disabled={pending}
                onClick={() => {
                  // Removing deletes the seat with its points; in the lobby there is nothing to lose yet.
                  if (view.status === "running" && !window.confirm(`Remove ${p.name}? Their points in this game are lost.`)) return;
                  run(() => kickPlayerAction(sessionId, p.attemptId));
                }}
                className="rounded-full p-1 text-muted hover:bg-danger-soft hover:text-danger disabled:opacity-40"
              >
                <X className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      {view.removed.length > 0 && (
        <section aria-label="Removed players" className="border-t border-border pt-4">
          <h3 className="text-xs font-semibold text-muted uppercase">Removed</h3>
          <ul className="mt-2 space-y-1">
            {view.removed.map((r) => (
              <li key={r.userId} className="flex items-center gap-2 px-1 py-1">
                <AvatarImage avatar={r.avatar} size={28} />
                <span className="min-w-0 flex-1 truncate text-sm text-muted">{r.name}</span>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => allowRejoinAction(sessionId, r.userId))}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-primary hover:bg-primary-soft disabled:opacity-40"
                >
                  <UserCheck className="size-3.5" aria-hidden /> Allow back
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </aside>
  );
}

function Controls({
  view,
  sessionId,
  pending,
  run,
}: {
  view: GameView;
  sessionId: string;
  pending: boolean;
  run: (action: () => Promise<{ error: string } | object>) => void;
}) {
  const teacherPaced = view.status === "running" && view.pacing === "teacher";
  const remaining = view.outline.filter((q) => !q.played);
  const last = remaining.length === 0;
  const [seconds, setSeconds] = useState(String(view.questionSeconds));
  const [jump, setJump] = useState("");
  const secondsValue = Number(seconds);
  const secondsOk = Number.isInteger(secondsValue) && secondsValue >= gameMinSeconds && secondsValue <= gameMaxSeconds;
  return (
    <>
      {teacherPaced && (
        <div className="mr-auto flex flex-wrap items-center gap-2 text-sm" aria-label="Clock and questions">
          <label className="flex items-center gap-1.5">
            <span className="text-muted">Seconds</span>
            <input
              type="number"
              min={gameMinSeconds}
              max={gameMaxSeconds}
              value={seconds}
              onChange={(e) => setSeconds(e.target.value)}
              className="w-20 rounded-md border border-border bg-surface px-2 py-1 text-foreground"
              aria-label="Seconds per question"
            />
          </label>
          <Button
            variant="secondary"
           
            disabled={pending || !secondsOk || secondsValue === view.questionSeconds}
            onClick={() => run(() => setGameSecondsAction(sessionId, secondsValue))}
          >
            Set time
          </Button>
          <Select
            value={jump}
            onChange={setJump}
            disabled={view.phase === "question" || remaining.length === 0}
            size="xs"
            className="max-w-xs"
            aria-label="Next question"
            options={[
              { value: "", label: "Next: in order" },
              ...remaining.map((q) => ({ value: String(q.index), label: `${q.index + 1}. ${q.prompt}` })),
            ]}
          />
          <Button
            variant="secondary"
           
            disabled={pending || jump === "" || view.phase === "question"}
            onClick={() => {
              const index = Number(jump);
              setJump("");
              run(() => goToQuestionAction(sessionId, index));
            }}
          >
            Open
          </Button>
        </div>
      )}
      {view.status === "scheduled" && <Button disabled={pending} onClick={() => run(() => openLobbyAction(sessionId))}>Open the lobby</Button>}
      {view.status === "lobby" && (
        <Button disabled={pending || view.playerCount === 0} onClick={() => run(() => startGameAction(sessionId))}>
          Start the game
        </Button>
      )}
      {teacherPaced && view.phase === "question" && (
        <Button
          variant="secondary"
         
          disabled={pending}
          onClick={() => run(() => (view.paused ? resumeGameAction(sessionId) : pauseGameAction(sessionId)))}
        >
          {view.paused ? "Resume" : "Pause"}
        </Button>
      )}
      {teacherPaced && (
        <Button disabled={pending} onClick={() => run(() => advanceGameAction(sessionId))}>
          {view.phase === "question"
            ? "Close question"
            : view.phase === "reveal"
              ? view.showLeaderboard && !last
                ? "Show leaderboard"
                : last
                  ? "Final results"
                  : "Next question"
              : last
                ? "Final results"
                : "Next question"}
        </Button>
      )}
      {view.status === "running" && (
        <Button variant="secondary" disabled={pending} onClick={() => run(() => endGameAction(sessionId))}>
          End game
        </Button>
      )}
    </>
  );
}

const noSubscribe = () => () => {};

// The invite link (/join?id=KEY) on this site: it opens the join page with the key filled in, for guests (when the
// session allows them) and students alike. The origin is only known in the browser.
function InviteLink({ code }: { code: string }) {
  const origin = useSyncExternalStore(noSubscribe, () => window.location.origin, () => "");
  if (!origin) return null;
  const url = `${origin}/join?id=${formatJoinKey(code)}`;
  return (
    <p className="mt-3 text-muted">
      Or open <span className="font-mono text-foreground" data-testid="invite-link">{url}</span>
    </p>
  );
}

// The big key and everyone who joined; each one can be removed here or in the players panel.
function Lobby({
  view,
  sessionId,
  pending,
  run,
}: {
  view: GameView;
  sessionId: string;
  pending: boolean;
  run: (action: () => Promise<{ error: string } | object>) => void;
}) {
  return (
    <>
      <div className="text-center">
        {view.status === "scheduled" ? (
          <p className="text-xl text-muted">Open the lobby so students can join.</p>
        ) : (
          <>
            <p className="text-lg text-muted">Join with the key</p>
            <p className="animate-pop-in mt-1 font-mono text-7xl font-black tracking-[0.3em] sm:text-8xl" data-testid="join-code">
              {view.joinCode && formatJoinKey(view.joinCode)}
            </p>
            <p className="mt-2 text-muted">Students: open Examinus, choose “Join with a key”, and enter it.</p>
            {view.joinCode && <InviteLink code={view.joinCode} />}
          </>
        )}
      </div>
      {view.relay ? (
        <RelayLobbyBoard view={view} sessionId={sessionId} />
      ) : (
        <section aria-label="Joined" className="flex flex-wrap content-start justify-center gap-3">
          {view.players.length === 0 && view.status !== "scheduled" && <p className="text-muted">Waiting for players…</p>}
          {view.players.map((p, i) => (
            <span
              key={p.attemptId}
              className="animate-pop-in flex items-center gap-2 rounded-full border border-border bg-surface py-1 pr-2 pl-1 text-lg"
            >
              {/* Each one bobs a little out of step with its neighbours. */}
              <span className="animate-bob block" style={{ animationDelay: `${(i % 7) * -0.35}s` }}>
                <AvatarImage avatar={p.avatar} size={44} />
              </span>
              {p.name}
              {view.status === "lobby" && (
                <button
                  type="button"
                  aria-label={`Remove ${p.name}`}
                  title="Remove from the game"
                  disabled={pending}
                  onClick={() => run(() => kickPlayerAction(sessionId, p.attemptId))}
                  className="rounded-full p-1 text-muted hover:bg-danger-soft hover:text-danger disabled:opacity-40"
                >
                  <X className="size-4" aria-hidden />
                </button>
              )}
            </span>
          ))}
        </section>
      )}
    </>
  );
}

function QuestionBlock({ view }: { view: GameView }) {
  const q = view.question;
  if (!q) return null;
  return (
    <div key={q.id} className="animate-rise space-y-5">
      <Markdown className="text-3xl font-bold leading-snug" assetUrls={view.assetUrls}>
        {q.prompt}
      </Markdown>
      <Options q={q} assetUrls={view.assetUrls} />
    </div>
  );
}

function Options({ q, assetUrls }: { q: StudentQuestion; assetUrls: Record<string, string> }) {
  if (q.type === "multiple_choice")
    return (
      <ul className="grid gap-3 sm:grid-cols-2">
        {q.choices.map((c, i) => (
          <li
            key={c.id}
            className={clsx("animate-pop-in rounded-xl px-5 py-4 text-xl font-semibold", choiceStyles[i % choiceStyles.length])}
            style={{ animationDelay: `${0.2 + i * 0.1}s` }}
          >
            <Markdown inline assetUrls={assetUrls}>
              {c.text || "(image)"}
            </Markdown>
          </li>
        ))}
      </ul>
    );
  if (q.type === "true_false")
    return (
      <ul className="grid gap-3 sm:grid-cols-2">
        {["True", "False"].map((label, i) => (
          <li
            key={label}
            className={clsx("animate-pop-in rounded-xl px-5 py-6 text-center text-2xl font-bold", choiceStyles[i])}
            style={{ animationDelay: `${0.2 + i * 0.1}s` }}
          >
            {label}
          </li>
        ))}
      </ul>
    );
  return <p className="text-lg text-muted">Students answer on their own screens.</p>;
}

function TeacherPaced({ view, remainingMs, sessionId }: { view: GameView; remainingMs: number | null; sessionId: string }) {
  return (
    <>
      {view.phase === "question" && (
        <>
          <CountdownBar remainingMs={remainingMs} totalSeconds={view.questionSeconds} />
          {view.paused && (
            <p className="text-center text-2xl font-bold text-warning" role="status">
              Paused
            </p>
          )}
          <QuestionBlock view={view} />
          <p className="text-center text-2xl font-semibold tabular-nums" data-testid="answered-count">
            <span key={view.answeredCount} className="animate-pop-in inline-block">
              {view.answeredCount}
            </span>{" "}
            of {view.playerCount} answered
          </p>
        </>
      )}
      {view.phase === "reveal" && view.reveal && (
        <>
          <Markdown className="text-2xl font-bold" assetUrls={view.assetUrls}>
            {view.question?.prompt ?? ""}
          </Markdown>
          {view.reveal.buckets.length > 0 && <Buckets buckets={view.reveal.buckets} />}
          {view.reveal.answer && (
            <p className="animate-rise rounded-lg bg-success-soft px-4 py-3 text-lg" style={{ animationDelay: "0.6s" }}>
              <span className="text-muted">Answer: </span>
              <span className="font-semibold">{view.reveal.answer}</span>
            </p>
          )}
          {view.question?.type === "drawing" && <Gallery sessionId={sessionId} questionId={view.question.id} question={view.question} />}
        </>
      )}
      {view.phase === "leaderboard" && (
        <>
          <h2 className="animate-pop-in text-center text-3xl font-bold">Leaderboard</h2>
          <div className="mx-auto w-full max-w-3xl">
            <Leaderboard rows={view.leaderboard.slice(0, 8)} big historyKey={view.sessionId} />
          </div>
        </>
      )}
    </>
  );
}

function StudentPaced({ view, drawingQuestions, sessionId, roundMs }: { view: GameView; drawingQuestions: DrawingQuestionRef[]; sessionId: string; roundMs: number | null }) {
  if (view.relay) return <RelayRunning view={view} roundMs={roundMs} />;
  return (
    <>
      <p className="text-center text-xl text-muted" data-testid="finished-count">
        {view.answeredCount} of {view.playerCount} finished
      </p>
      <h2 className="text-center text-3xl font-bold">Live leaderboard</h2>
      <div className="mx-auto w-full max-w-3xl">
        <Leaderboard rows={view.leaderboard.slice(0, 10)} big historyKey={view.sessionId} />
      </div>
      <GalleryPicker sessionId={sessionId} drawingQuestions={drawingQuestions} />
    </>
  );
}

function Ended({
  view,
  exportHref,
  backHref,
  drawingQuestions,
  sessionId,
}: {
  view: GameView;
  exportHref: string;
  backHref: string;
  drawingQuestions: DrawingQuestionRef[];
  sessionId: string;
}) {
  return (
    <>
      <Confetti />
      {view.relay ? (
        <RelayEnded view={view} />
      ) : (
        <>
          <h2 className="animate-pop-in text-center text-4xl font-black">Final results</h2>
          <Podium rows={view.leaderboard.slice(0, 3)} />
          <div className="animate-rise mx-auto w-full max-w-3xl" style={{ animationDelay: "2s" }}>
            <Leaderboard rows={view.leaderboard.slice(3, 10)} />
          </div>
          <GalleryPicker sessionId={sessionId} drawingQuestions={drawingQuestions} />
        </>
      )}
      <div className="flex justify-center gap-3">
        <ButtonDownload href={exportHref}>Download standings (Excel)</ButtonDownload>
        <ButtonLink href={backHref} variant="secondary">
          Back to results
        </ButtonLink>
      </div>
    </>
  );
}

function GalleryPicker({ sessionId, drawingQuestions }: { sessionId: string; drawingQuestions: DrawingQuestionRef[] }) {
  const [chosen, setChosen] = useState<string | null>(drawingQuestions[0]?.id ?? null);
  if (drawingQuestions.length === 0) return null;
  const q = drawingQuestions.find((d) => d.id === chosen) ?? drawingQuestions[0]!;
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-3">
        <h3 className="text-xl font-bold">Gallery</h3>
        <Select
          value={q.id}
          onChange={setChosen}
          aria-label="Drawing question"
          size="sm"
          options={drawingQuestions.map((d) => ({ value: d.id, label: `Question ${d.number}` }))}
        />
      </div>
      <Gallery sessionId={sessionId} questionId={q.id} question={null} />
    </section>
  );
}

// What the class drew for one question. Names stay hidden until the teacher shows them.
function Gallery({ sessionId, questionId, question }: { sessionId: string; questionId: string; question: StudentQuestion | null }) {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [names, setNames] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let stop = false;
    void getGalleryAction(sessionId, questionId).then((result) => {
      if (stop || "error" in result) return;
      setItems([...result.ok.items]);
      setUrls(result.ok.assetUrls);
      setLoaded(true);
    });
    return () => {
      stop = true;
    };
  }, [sessionId, questionId, version]);
  const size = question?.type === "drawing" ? question : null;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Button variant="secondary" onClick={() => setNames((n) => !n)}>
          {names ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
          {names ? "Hide names" : "Show names"}
        </Button>
        <Button variant="secondary" onClick={() => setVersion((v) => v + 1)}>
          Refresh
        </Button>
        <span className="text-sm text-muted">{loaded ? `${items.length} drawings` : "Loading…"}</span>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Gallery">
        {items.map((item, i) => {
          const drawing = parseDrawingAnswer(item.value);
          const picture = drawing.assetId ? urls[drawing.assetId] : undefined;
          return (
            <li key={item.attemptId} className="overflow-hidden rounded-xl border border-border bg-white text-slate-900">
              {drawing.strokes.length > 0 || picture ? (
                <DrawingPicture
                  width={size?.canvasWidth ?? 800}
                  height={size?.canvasHeight ?? 600}
                  {...(picture ? { pictureUrl: picture } : {})}
                  strokes={drawing.strokes}
                  marks={[]}
                  label={names ? `Drawing by ${item.name}` : `Drawing ${i + 1}`}
                />
              ) : (
                <div className="flex flex-wrap gap-1 p-2">
                  {drawing.photos.map((id) => (
                    // eslint-disable-next-line @next/next/no-img-element -- a signed URL of the student's own photo
                    <img key={id} src={urls[id]} alt={`Photo ${i + 1}`} className="max-h-60 rounded" />
                  ))}
                </div>
              )}
              <p className="px-3 py-1.5 text-sm font-medium">{names ? item.name : `Drawing ${i + 1}`}</p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
