"use client";

import { useState, useTransition } from "react";
import clsx from "clsx";
import { Check, CircleDashed, Hourglass, LifeBuoy, Lock, RotateCcw, Users } from "lucide-react";
import type { RelayMember, RelayMyTeam, RelayPiece, RelayView } from "@examinus/contract/game";
import { Button, Card, inputClass } from "@/components/ui";
import { AvatarImage } from "@/components/avatar";
import {
  claimRescueAction,
  confirmPasswordAction,
  pickTeamAction,
  rejectPasswordAction,
  retryQuestionAction,
  submitPasswordAction,
} from "@/lib/game/actions";
import { Debrief, RoundClock } from "./relay-parts";

// Runs a server action and keeps its refusal text for display.
function useAction() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (action: () => Promise<{ error: string } | object>) =>
    start(async () => {
      const result = await action();
      setError("error" in result ? result.error : null);
    });
  return { pending, error, run };
}

const nameOf = (members: readonly RelayMember[], who: string) => members.find((m) => m.attemptId === who)?.name ?? who;

// The lobby: every team with its members and free places. With picking on, a Join button on each team that has room;
// the player's own team is marked in words as well as by its outline.
export function RelayPlayerLobby({ relay, sessionId }: { relay: RelayView; sessionId: string }) {
  const { pending, error, run } = useAction();
  const mine = relay.myTeamId;
  return (
    <section aria-label="Teams" className="w-full max-w-4xl space-y-3 text-left">
      <p className="text-center text-base text-muted" role="status">
        {relay.studentPick ? `Pick a team (up to ${relay.teamSize} players each).` : "Your teacher will assign teams."}
      </p>
      <ul className="grid gap-3 sm:grid-cols-2">
        {relay.teams.map((team) => {
          const free = Math.max(relay.teamSize - team.members.length, 0);
          const own = team.id === mine;
          return (
            <li
              key={team.id}
              aria-current={own ? "true" : undefined}
              className={clsx("rounded-xl border p-3", own ? "border-primary bg-primary-soft ring-2 ring-primary" : "border-border bg-surface")}
            >
              <div className="flex items-center gap-2">
                <h2 className="min-w-0 flex-1 truncate font-semibold">
                  {team.name}
                  {own && <span className="ml-2 text-sm font-medium text-primary">(your team)</span>}
                </h2>
                <span className="text-sm text-muted">{free === 0 ? "Full" : `${free} ${free === 1 ? "place" : "places"} free`}</span>
              </div>
              <ul className="mt-2 flex flex-wrap gap-2">
                {team.members.map((m) => (
                  <li key={m.attemptId} className="flex items-center gap-1.5 rounded-full bg-surface-muted py-0.5 pl-0.5 pr-3 text-sm">
                    <AvatarImage avatar={m.avatar} size={24} />
                    {m.name}
                  </li>
                ))}
                {team.members.length === 0 && <li className="text-sm text-muted">Nobody yet</li>}
              </ul>
              {relay.studentPick && !own && free > 0 && (
                <Button className="mt-3" variant="secondary" disabled={pending} onClick={() => run(() => pickTeamAction(sessionId, team.id))}>
                  <Users className="size-4" aria-hidden /> Join {team.name}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {relay.unassigned.length > 0 && (
        <p className="text-sm text-muted">Not in a team yet: {relay.unassigned.map((m) => m.name).join(", ")}</p>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </section>
  );
}

// What a slot says to a screen reader: its place, and its letter (or word, or clue) when unlocked, or why not.
function slotLabel(piece: RelayPiece, index: number, total: number, kind: RelayView["pieceKind"]): string {
  const place = `slot ${index + 1} of ${total}`;
  if (piece.state === "unlocked" && piece.text !== null) {
    const noun = kind === "letter" ? "letter" : kind === "word" ? "word" : kind === "clue" ? "clue" : "piece";
    const at = kind === "coordinate" && piece.position !== null ? `, position ${piece.position}` : "";
    return `${place}, ${noun} ${piece.text}${at}`;
  }
  const why: Record<RelayPiece["state"], string> = {
    unlocked: "unlocked",
    open: "locked, waiting for an answer",
    retry: "locked, owner may try again",
    rescue: "locked, can be rescued",
    rescuing: "locked, being rescued",
    locked: "locked",
  };
  return `${place}, ${why[piece.state]}`;
}

const slotWords: Record<RelayPiece["state"], string> = {
  unlocked: "",
  open: "waiting",
  retry: "retry",
  rescue: "rescue",
  rescuing: "rescuing",
  locked: "locked",
};

// The password so far: one box per question slot. Each box says its state in a word and an icon, not by colour alone.
function Board({ team, kind }: { team: RelayMyTeam; kind: RelayView["pieceKind"] }) {
  const wide = kind === "word" || kind === "clue";
  return (
    <ol className="flex flex-wrap gap-2" aria-label="Password pieces">
      {team.board.map((piece, i) => {
        const open = piece.state === "unlocked" && piece.text !== null;
        const Icon = piece.state === "rescuing" ? LifeBuoy : piece.state === "rescue" || piece.state === "retry" ? Hourglass : piece.state === "open" ? CircleDashed : Lock;
        return (
          <li
            key={i}
            title={piece.owner}
            className={clsx(
              "flex min-h-14 flex-col items-center justify-center rounded-lg border-2 px-2 py-1 text-center",
              wide ? "min-w-24 max-w-64" : "min-w-12",
              open ? "border-emerald-500 bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100" : "border-dashed border-border bg-surface-muted text-muted",
            )}
          >
            <span className="sr-only">{slotLabel(piece, i, team.board.length, kind)}</span>
            <span aria-hidden className="flex flex-col items-center">
              {open ? (
                <>
                  {kind === "coordinate" && piece.position !== null && <span className="text-[10px] leading-none">{piece.position}</span>}
                  <span className={clsx("flex items-center gap-1 font-bold", wide ? "text-sm" : "text-xl uppercase")}>
                    <Check className="size-3 shrink-0" /> {piece.text}
                  </span>
                </>
              ) : (
                <>
                  <Icon className="size-4" />
                  <span className="text-[10px] uppercase leading-none">{slotWords[piece.state]}</span>
                </>
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

// The team's panel during the game: round clock, the board, the password form (or the proposal waiting for
// confirmation), the retry button, and once the round is over the password and the debrief.
export function RelayTeamPanel({
  relay,
  sessionId,
  meAttemptId,
  meName,
  roundMs,
  retryButton = true,
}: {
  relay: RelayView;
  sessionId: string;
  meAttemptId: string;
  meName: string;
  roundMs: number | null;
  // The reveal screen shows its own retry button next to "Next question".
  retryButton?: boolean;
}) {
  const team = relay.team;
  const { pending, error, run } = useAction();
  const [guess, setGuess] = useState("");
  if (!team) return null;
  const unlocked = team.board.filter((p) => p.state === "unlocked").length;
  const proposal = team.proposal;
  const confirmedByMe = proposal ? proposal.confirmed.some((c) => c === meAttemptId || c === meName) : false;
  const last = team.lastGuess;
  return (
    <Card className="space-y-3 p-4 text-left" data-testid="relay-team">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 className="text-lg font-semibold">Team {team.name}</h2>
        <span className="text-sm text-muted">
          {unlocked} of {team.board.length} pieces unlocked
        </span>
        <span className="ml-auto">
          <RoundClock ms={roundMs} />
        </span>
      </div>
      <p className="text-sm text-muted">With {team.members.filter((m) => m.attemptId !== meAttemptId).map((m) => m.name).join(", ") || "nobody else"}</p>
      <Board team={team} kind={relay.pieceKind} />

      {team.finished ? (
        <p role="status" className="font-medium">
          {team.solved ? "Your team solved the password!" : "Your team's round is over."}
          {team.password && (
            <>
              {" "}
              The password was <span className="font-mono font-bold">{team.password}</span>.
            </>
          )}
        </p>
      ) : (
        <div className="space-y-2">
          <p className="text-sm" data-testid="guesses-left">
            Guesses left: <span className="font-semibold">{team.guessesLeft}</span>
          </p>
          {proposal ? (
            <div className="rounded-lg border border-border bg-surface-muted p-3 text-sm" role="status">
              <p>
                {nameOf(team.members, proposal.by)} proposes <span className="font-mono font-bold">{proposal.guess}</span>
              </p>
              <p className="text-muted">
                Confirmed by {proposal.confirmed.length} of {proposal.needed}
                {proposal.confirmed.length > 0 && `: ${proposal.confirmed.map((c) => nameOf(team.members, c)).join(", ")}`}
              </p>
              <div className="mt-2 flex gap-2">
                <Button disabled={pending || confirmedByMe} onClick={() => run(() => confirmPasswordAction(sessionId))}>
                  {confirmedByMe ? "You confirmed" : "Confirm"}
                </Button>
                <Button variant="secondary" disabled={pending} onClick={() => run(() => rejectPasswordAction(sessionId))}>
                  Reject
                </Button>
              </div>
            </div>
          ) : (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const value = guess.trim();
                if (!value) return;
                run(async () => {
                  const result = await submitPasswordAction(sessionId, value);
                  if (!("error" in result)) setGuess("");
                  return result;
                });
              }}
            >
              <input
                value={guess}
                onChange={(e) => setGuess(e.target.value)}
                maxLength={200}
                autoComplete="off"
                aria-label={relay.requireConsensus ? "Propose the team password" : "Team password guess"}
                placeholder="Team password"
                className={clsx(inputClass, "flex-1")}
              />
              <Button type="submit" disabled={pending || guess.trim() === ""}>
                {relay.requireConsensus ? "Propose" : "Submit"}
              </Button>
            </form>
          )}
        </div>
      )}

      {last && !last.correct && !team.finished && (
        <p role="status" className="text-sm text-danger">
          {nameOf(team.members, last.by)} guessed “{last.guess}”: not the password.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      {retryButton && <RetryButton team={team} sessionId={sessionId} />}
    </Card>
  );
}

// After a wrong answer: answer the same question again for fewer points.
export function RetryButton({ team, sessionId }: { team: RelayMyTeam; sessionId: string }) {
  const { pending, error, run } = useAction();
  if (!team.retry) return null;
  return (
    <div className="space-y-1">
      <Button variant="secondary" disabled={pending} onClick={() => run(() => retryQuestionAction(sessionId))}>
        <RotateCcw className="size-4" aria-hidden /> Try again ({team.retry.percent}% of the points, {team.retry.left} {team.retry.left === 1 ? "try" : "tries"} left)
      </Button>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

// Teammates' locked questions a finished player may answer for part of the points.
export function RescueList({ team, sessionId }: { team: RelayMyTeam; sessionId: string }) {
  const { pending, error, run } = useAction();
  if (team.finished || team.rescuable.length === 0) return null;
  return (
    <section aria-label="Rescue a teammate" className="w-full space-y-2 text-left">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <LifeBuoy className="size-5" aria-hidden /> Rescue a teammate
      </h2>
      <p className="text-sm text-muted">You finished your questions. Answer one of these once, for part of the points, to unlock its piece.</p>
      <ul className="space-y-2">
        {team.rescuable.map((r) => (
          <li key={r.questionId} className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted">{r.owner ? `${r.owner}'s question` : "Question without an owner"}</p>
              <p className="line-clamp-2 text-sm font-medium">{r.prompt}</p>
            </div>
            <Button disabled={pending} onClick={() => run(() => claimRescueAction(sessionId, r.questionId))}>
              Rescue
            </Button>
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </section>
  );
}

// The team's questions after its round.
export function TeamDebrief({ team }: { team: RelayMyTeam }) {
  if (!team.debrief) return null;
  return (
    <section aria-label="Team debrief" className="w-full space-y-3 text-left">
      <h2 className="text-xl font-semibold">Debrief</h2>
      <Debrief items={team.debrief} />
    </section>
  );
}
