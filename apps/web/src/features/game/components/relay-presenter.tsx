"use client";

import { useState, useTransition } from "react";
import clsx from "clsx";
import { AlertTriangle, Plus, Shuffle, Trash2, Scale } from "lucide-react";
import type { GameView, RelayMember, RelayTeamSummary } from "@examinus/contract/game";
import { Button } from "@/components/ui";
import { AvatarImage } from "@/features/auth/components/avatar";
import { Dialog } from "@/components/dialog";
import { addTeamAction, assignTeamAction, balanceTeamsAction, randomizeTeamsAction, removeTeamAction, setStudentPickAction } from "@/features/game/actions";
import { Debrief, RoundClock, TeamPodium, rankedTeams, teamStatus } from "./relay-parts";

const unassignedKey = "unassigned";

// The lobby team board: one column per team plus "Unassigned". A player is dragged to a column, or moved with the
// menu under their name (keyboard and touch). Every change goes to the server, which publishes the new view.
export function RelayLobbyBoard({ view, sessionId }: { view: GameView; sessionId: string }) {
  const relay = view.relay!;
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [overColumn, setOverColumn] = useState<string | null>(null);
  const [confirmRandomize, setConfirmRandomize] = useState(false);
  // The open lobby is the only time the board can change.
  const editable = view.status === "lobby";

  function run(action: () => Promise<{ error: string } | object>) {
    start(async () => {
      const result = await action();
      setError("error" in result ? result.error : null);
    });
  }

  function move(attemptId: string, column: string) {
    run(() => assignTeamAction(sessionId, attemptId, column === unassignedKey ? null : column));
  }

  const columns: { key: string; name: string; members: readonly RelayMember[]; team: RelayTeamSummary | null }[] = [
    ...relay.teams.map((team) => ({ key: team.id, name: team.name, members: team.members, team })),
    { key: unassignedKey, name: "Unassigned", members: relay.unassigned, team: null },
  ];

  return (
    <section aria-label="Teams" className="space-y-4">
      {editable && (
        <div className="flex flex-wrap items-center justify-center gap-3 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={relay.studentPick}
              disabled={pending}
              onChange={(e) => run(() => setStudentPickAction(sessionId, e.target.checked))}
              className="size-4"
            />
            Allow students to pick their team
          </label>
          <Button variant="secondary" className="!text-slate-900" disabled={pending} onClick={() => setConfirmRandomize(true)}>
            <Shuffle className="size-4" aria-hidden /> Randomize teams
          </Button>
          <Button variant="secondary" className="!text-slate-900" disabled={pending} onClick={() => run(() => balanceTeamsAction(sessionId))}>
            <Scale className="size-4" aria-hidden /> Balance teams
          </Button>
          <Button variant="secondary" className="!text-slate-900" disabled={pending} onClick={() => run(() => addTeamAction(sessionId))}>
            <Plus className="size-4" aria-hidden /> Add team
          </Button>
        </div>
      )}
      <p className="text-center text-sm text-white/60">
        Teams of up to {relay.teamSize}. {editable ? "Drag a player to a team, or use the menu under their name." : "Open the lobby to arrange teams."}
      </p>
      {error && (
        <p role="alert" className="text-center text-sm text-red-300">
          {error}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {columns.map((column) => {
          const count = column.members.length;
          const warning = !column.team ? null : count > relay.teamSize ? `Over the team size of ${relay.teamSize}` : count === 1 ? "Only 1 member" : null;
          return (
            <div
              key={column.key}
              role="group"
              aria-label={`${column.name}, ${count} ${count === 1 ? "player" : "players"}`}
              onDragOver={(e) => {
                if (!editable) return;
                e.preventDefault();
                setOverColumn(column.key);
              }}
              onDragLeave={() => setOverColumn((current) => (current === column.key ? null : current))}
              onDrop={(e) => {
                e.preventDefault();
                setOverColumn(null);
                const attemptId = e.dataTransfer.getData("text/plain");
                if (editable && attemptId && !column.members.some((m) => m.attemptId === attemptId)) move(attemptId, column.key);
              }}
              className={clsx(
                "flex min-h-40 flex-col gap-2 rounded-xl border p-3",
                overColumn === column.key ? "border-sky-300 bg-sky-400/20" : "border-white/15 bg-white/5",
              )}
            >
              <div className="flex items-center gap-2">
                <h3 className="min-w-0 flex-1 truncate font-semibold">{column.name}</h3>
                <span className="text-sm tabular-nums text-white/70">{column.team ? `${count}/${relay.teamSize}` : count}</span>
                {editable && column.team && (
                  <button
                    type="button"
                    disabled={pending || relay.teams.length <= 1}
                    onClick={() => run(() => removeTeamAction(sessionId, column.key))}
                    className="rounded-md p-1 text-white/70 hover:bg-white/10 disabled:opacity-40"
                    title={`Remove team ${column.name}`}
                  >
                    <Trash2 className="size-4" aria-hidden />
                    <span className="sr-only">Remove team {column.name}</span>
                  </button>
                )}
              </div>
              {warning && (
                <p className="flex items-center gap-1 text-xs font-medium text-amber-300" role="status">
                  <AlertTriangle className="size-3.5" aria-hidden /> {warning}
                </p>
              )}
              <ul className="flex flex-col gap-2">
                {column.members.map((p) => (
                  <li
                    key={p.attemptId}
                    draggable={editable}
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", p.attemptId);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragEnd={() => setOverColumn(null)}
                    className={clsx("flex items-center gap-2 rounded-lg bg-white/10 p-1.5 pr-2", editable && "cursor-grab")}
                  >
                    <AvatarImage avatar={p.avatar} size={32} />
                    <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
                    {editable && (
                      <select
                        aria-label={`Move ${p.name} to`}
                        value={column.key}
                        disabled={pending}
                        onChange={(e) => move(p.attemptId, e.target.value)}
                        className="max-w-28 rounded-md border border-white/20 bg-slate-900 px-1 py-0.5 text-xs text-white"
                      >
                        {columns.map((c) => (
                          <option key={c.key} value={c.key}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </li>
                ))}
                {count === 0 && <li className="text-sm text-white/50">{column.team ? "Empty" : "Nobody waiting"}</li>}
              </ul>
            </div>
          );
        })}
      </div>
      <Dialog
        open={confirmRandomize}
        onClose={() => setConfirmRandomize(false)}
        title="Randomize teams?"
        description="Every player is dealt into a team again. This replaces the teams students picked."
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmRandomize(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setConfirmRandomize(false);
                run(() => randomizeTeamsAction(sessionId));
              }}
            >
              Randomize
            </Button>
          </>
        }
      >
        <p className="text-sm">Students&apos; own picks and your moves are replaced by a random draw.</p>
      </Dialog>
    </section>
  );
}

// While the relay runs: the clock, and every team's progress with the live team leaderboard.
export function RelayRunning({ view, roundMs }: { view: GameView; roundMs: number | null }) {
  const relay = view.relay!;
  const roundOver = roundMs === 0;
  const finishedCount = relay.teams.filter((t) => t.finished).length;
  return (
    <section aria-label="Team progress" className="space-y-4">
      <div className="text-center">
        <RoundClock ms={roundMs} dark />
        <p className="text-xl text-white/80" data-testid="finished-count">
          {finishedCount} of {relay.teams.length} teams finished
        </p>
      </div>
      <h2 className="text-center text-3xl font-bold">Team leaderboard</h2>
      <ol className="mx-auto w-full max-w-4xl space-y-3">
        {rankedTeams(relay.teams).map((team) => (
          <TeamRow key={team.id} team={team} roundOver={roundOver} />
        ))}
      </ol>
    </section>
  );
}

function TeamRow({ team, roundOver }: { team: RelayTeamSummary; roundOver: boolean }) {
  const percent = team.pieces === 0 ? 0 : Math.round((team.unlocked / team.pieces) * 100);
  return (
    <li className="rounded-xl border border-white/15 bg-white/5 p-4">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="text-2xl font-black tabular-nums">{team.rank || "–"}</span>
        <span className="min-w-0 flex-1 truncate text-xl font-semibold">{team.name}</span>
        <span className="text-sm font-semibold">{teamStatus(team, roundOver)}</span>
        <span className="text-xl font-bold tabular-nums">{team.points.toLocaleString()} points</span>
      </div>
      <div
        role="progressbar"
        aria-label={`${team.name} pieces unlocked`}
        aria-valuemin={0}
        aria-valuemax={team.pieces}
        aria-valuenow={team.unlocked}
        className="mt-2 h-3 overflow-hidden rounded-full bg-white/15"
      >
        <div className="h-full rounded-full bg-emerald-400 transition-[width]" style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-2 flex flex-wrap gap-x-4 text-sm text-white/70">
        <span>
          Pieces: {team.unlocked}/{team.pieces}
        </span>
        <span>Wrong guesses: {team.wrongGuesses}</span>
        {team.solvedAt && <span>Solved at {new Date(team.solvedAt).toLocaleTimeString()}</span>}
        <span className="truncate">{team.members.map((m) => m.name).join(", ")}</span>
      </p>
    </li>
  );
}

// The final team results: the podium, the table, and each team's debrief.
export function RelayEnded({ view }: { view: GameView }) {
  const relay = view.relay!;
  const ranked = rankedTeams(relay.teams);
  const [chosen, setChosen] = useState<string | null>(null);
  const shown = relay.debriefs.find((d) => d.teamId === chosen) ?? relay.debriefs[0] ?? null;
  return (
    <>
      <h2 className="animate-pop-in text-center text-4xl font-black">Final team results</h2>
      <TeamPodium teams={relay.teams} dark />
      <ol className="mx-auto w-full max-w-3xl space-y-2">
        {ranked.map((team) => (
          <li key={team.id} className="flex flex-wrap items-baseline gap-x-4 rounded-lg bg-white/5 px-4 py-2">
            <span className="w-6 font-black tabular-nums">{team.rank}</span>
            <span className="min-w-0 flex-1 truncate font-semibold">{team.name}</span>
            <span className="text-sm text-white/70">
              {team.solvedAt ? "Solved" : "Not solved"} · {team.unlocked}/{team.pieces} pieces · {team.wrongGuesses} wrong
            </span>
            <span className="font-bold tabular-nums">{team.points.toLocaleString()}</span>
            {team.password && (
              <span className="w-full text-sm text-white/60">
                Password: <span className="font-mono text-white/90">{team.password}</span>
              </span>
            )}
          </li>
        ))}
      </ol>
      {relay.debriefs.length > 0 && shown && (
        <section aria-label="Team debrief" className="mx-auto w-full max-w-3xl space-y-3">
          <h3 className="text-2xl font-bold">Debrief</h3>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Choose a team">
            {relay.debriefs.map((d) => (
              <button
                key={d.teamId}
                type="button"
                aria-pressed={d.teamId === shown.teamId}
                onClick={() => setChosen(d.teamId)}
                className={clsx(
                  "rounded-full border px-4 py-1.5 text-sm font-medium",
                  d.teamId === shown.teamId ? "border-white bg-white text-slate-900" : "border-white/30 hover:bg-white/10",
                )}
              >
                {d.teamName}
              </button>
            ))}
          </div>
          <Debrief items={shown.items} dark />
        </section>
      )}
    </>
  );
}
