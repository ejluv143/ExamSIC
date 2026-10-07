"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Eye, EyeOff, Users, X } from "lucide-react";
import { parseDrawingAnswer, type GalleryItem, type GameView, type StudentQuestion } from "@examora/contract";
import { Button, ButtonDownload } from "@/components/ui";
import { DrawingPicture } from "@/components/drawing-picture";
import { Markdown } from "@/components/markdown";
import {
  advanceGameAction,
  endGameAction,
  getGalleryAction,
  kickPlayerAction,
  openLobbyAction,
  startGameAction,
} from "@/lib/game/actions";
import { Buckets, choiceStyles, CountdownBar, Leaderboard, Podium, useGameView, useRemainingMs } from "./game-parts";

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
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const view = stamped?.view ?? null;

  function run(action: () => Promise<{ error: string } | object>) {
    start(async () => {
      const result = await action();
      setError("error" in result ? result.error : null);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-auto bg-slate-950 text-white" data-testid="presenter">
      <header className="flex items-center gap-4 border-b border-white/10 px-6 py-3">
        <p className="min-w-0 flex-1 truncate text-lg font-semibold">{view?.title ?? "Game"}</p>
        {view && view.phase !== "lobby" && view.phase !== "ended" && view.pacing === "teacher" && (
          <p className="text-sm text-white/70">
            Question {view.questionIndex + 1} of {view.questionCount}
          </p>
        )}
        <span className="flex items-center gap-1.5 text-sm text-white/70">
          <Users className="size-4" aria-hidden /> {view?.playerCount ?? 0}
        </span>
        {status !== "live" && <span className="text-sm text-amber-300">{status === "closed" ? "Disconnected" : "Connecting…"}</span>}
        <Link href={backHref} className="rounded-md px-3 py-1.5 text-sm text-white/80 hover:bg-white/10">
          Exit
        </Link>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-6">
        {!view ? (
          <p className="m-auto text-xl text-white/70">Connecting…</p>
        ) : view.phase === "lobby" ? (
          <Lobby view={view} sessionId={sessionId} run={run} />
        ) : view.phase === "ended" ? (
          <Ended view={view} exportHref={exportHref} backHref={backHref} drawingQuestions={drawingQuestions} sessionId={sessionId} />
        ) : view.pacing === "student" ? (
          <StudentPaced view={view} drawingQuestions={drawingQuestions} sessionId={sessionId} />
        ) : (
          <TeacherPaced view={view} remainingMs={remaining} sessionId={sessionId} />
        )}
      </main>

      <footer className="flex flex-wrap items-center justify-end gap-3 border-t border-white/10 px-6 py-3">
        {error && (
          <p role="alert" className="mr-auto text-sm text-red-300">
            {error}
          </p>
        )}
        {view && view.phase !== "ended" && <Controls view={view} sessionId={sessionId} pending={pending} run={run} />}
      </footer>
    </div>
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
  const last = view.questionIndex + 1 >= view.questionCount;
  return (
    <>
      {view.status === "scheduled" && <Button disabled={pending} onClick={() => run(() => openLobbyAction(sessionId))}>Open the lobby</Button>}
      {view.status === "lobby" && (
        <Button disabled={pending || view.playerCount === 0} onClick={() => run(() => startGameAction(sessionId))}>
          Start the game
        </Button>
      )}
      {view.status === "running" && view.pacing === "teacher" && (
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
        <Button variant="secondary" className="!text-slate-900" disabled={pending} onClick={() => run(() => endGameAction(sessionId))}>
          End game
        </Button>
      )}
    </>
  );
}

function Lobby({
  view,
  sessionId,
  run,
}: {
  view: GameView;
  sessionId: string;
  run: (action: () => Promise<{ error: string } | object>) => void;
}) {
  return (
    <>
      <div className="text-center">
        {view.status === "scheduled" ? (
          <p className="text-xl text-white/80">Open the lobby so students can join.</p>
        ) : (
          <>
            <p className="text-lg text-white/70">Join with the code</p>
            <p className="mt-1 font-mono text-7xl font-black tracking-[0.3em] sm:text-8xl" data-testid="join-code">
              {view.joinCode}
            </p>
            <p className="mt-2 text-white/70">Students: open Examora, choose “Join with code”, and type it in.</p>
          </>
        )}
      </div>
      <section aria-label="Players" className="flex flex-wrap content-start justify-center gap-2">
        {view.lobby.length === 0 && view.status !== "scheduled" && <p className="text-white/60">Waiting for players…</p>}
        {view.lobby.map((p) => (
          <span key={p.attemptId} className="group flex items-center gap-1 rounded-full bg-white/10 py-1.5 pl-4 pr-2 text-lg">
            {p.name}
            <button
              type="button"
              aria-label={`Remove ${p.name}`}
              onClick={() => run(() => kickPlayerAction(sessionId, p.attemptId))}
              className="rounded-full p-1 text-white/50 hover:bg-white/20 hover:text-white"
            >
              <X className="size-4" aria-hidden />
            </button>
          </span>
        ))}
      </section>
    </>
  );
}

function QuestionBlock({ view }: { view: GameView }) {
  const q = view.question;
  if (!q) return null;
  return (
    <div className="space-y-5">
      <Markdown className="text-3xl font-bold leading-snug [&_*]:text-white" assetUrls={view.assetUrls}>
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
          <li key={c.id} className={clsx("rounded-xl px-5 py-4 text-xl font-semibold", choiceStyles[i % choiceStyles.length])}>
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
          <li key={label} className={clsx("rounded-xl px-5 py-6 text-center text-2xl font-bold", choiceStyles[i])}>
            {label}
          </li>
        ))}
      </ul>
    );
  return <p className="text-lg text-white/60">Students answer on their own screens.</p>;
}

function TeacherPaced({ view, remainingMs, sessionId }: { view: GameView; remainingMs: number | null; sessionId: string }) {
  return (
    <>
      {view.phase === "question" && (
        <>
          <CountdownBar remainingMs={remainingMs} totalSeconds={view.questionSeconds} dark />
          <QuestionBlock view={view} />
          <p className="text-center text-2xl font-semibold tabular-nums" data-testid="answered-count">
            {view.answeredCount} of {view.playerCount} answered
          </p>
        </>
      )}
      {view.phase === "reveal" && view.reveal && (
        <>
          <Markdown className="text-2xl font-bold [&_*]:text-white" assetUrls={view.assetUrls}>
            {view.question?.prompt ?? ""}
          </Markdown>
          {view.reveal.buckets.length > 0 && <Buckets buckets={view.reveal.buckets} dark />}
          {view.reveal.answer && (
            <p className="rounded-lg bg-emerald-600/20 px-4 py-3 text-lg">
              <span className="text-white/70">Answer: </span>
              <span className="font-semibold">{view.reveal.answer}</span>
            </p>
          )}
          {view.question?.type === "drawing" && <Gallery sessionId={sessionId} questionId={view.question.id} question={view.question} />}
        </>
      )}
      {view.phase === "leaderboard" && (
        <>
          <h2 className="text-center text-3xl font-bold">Leaderboard</h2>
          <div className="mx-auto w-full max-w-3xl">
            <Leaderboard rows={view.leaderboard.slice(0, 8)} dark big />
          </div>
        </>
      )}
    </>
  );
}

function StudentPaced({ view, drawingQuestions, sessionId }: { view: GameView; drawingQuestions: DrawingQuestionRef[]; sessionId: string }) {
  return (
    <>
      <p className="text-center text-xl text-white/80" data-testid="finished-count">
        {view.answeredCount} of {view.playerCount} finished
      </p>
      <h2 className="text-center text-3xl font-bold">Live leaderboard</h2>
      <div className="mx-auto w-full max-w-3xl">
        <Leaderboard rows={view.leaderboard.slice(0, 10)} dark big />
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
      <h2 className="text-center text-4xl font-black">Final results</h2>
      <Podium rows={view.leaderboard.slice(0, 3)} dark />
      <div className="mx-auto w-full max-w-3xl">
        <Leaderboard rows={view.leaderboard.slice(3, 10)} dark />
      </div>
      <GalleryPicker sessionId={sessionId} drawingQuestions={drawingQuestions} />
      <div className="flex justify-center gap-3">
        <ButtonDownload href={exportHref} className="!text-slate-900">Download standings (Excel)</ButtonDownload>
        <Link href={backHref} className="rounded-lg border border-white/30 px-4 py-2 text-sm font-medium hover:bg-white/10">
          Back to results
        </Link>
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
        <select
          value={q.id}
          onChange={(e) => setChosen(e.target.value)}
          aria-label="Drawing question"
          className="rounded-md bg-white/10 px-3 py-1.5 text-sm"
        >
          {drawingQuestions.map((d) => (
            <option key={d.id} value={d.id} className="text-slate-900">
              Question {d.number}
            </option>
          ))}
        </select>
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
        <Button variant="secondary" className="!text-slate-900" onClick={() => setNames((n) => !n)}>
          {names ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
          {names ? "Hide names" : "Show names"}
        </Button>
        <Button variant="secondary" className="!text-slate-900" onClick={() => setVersion((v) => v + 1)}>
          Refresh
        </Button>
        <span className="text-sm text-white/60">{loaded ? `${items.length} drawings` : "Loading…"}</span>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Gallery">
        {items.map((item, i) => {
          const drawing = parseDrawingAnswer(item.value);
          const picture = drawing.assetId ? urls[drawing.assetId] : undefined;
          return (
            <li key={item.attemptId} className="overflow-hidden rounded-xl bg-white text-slate-900">
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
