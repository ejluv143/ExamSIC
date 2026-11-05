// What a screen is at: the one decision behind every game view. Pacing (teacher or student), relay or classic, who
// is looking (the presenter or a player) and where that player stands (team over, a rescue taken, finished) all
// meet here, as a pure function of the room and the clock. Views.ts fetches what the stage points at (the question's
// images, the relay's team) and assembles the view, and so never decides what a role may see.
//
// What a screen may learn is decided here too: `reveal` (the right answer and the split of answers) only exists once
// the question is closed for that screen, and `serve` only names a question: Views shows it in its student form,
// which has no answer key.
import type { GameLast, GamePhase, GameView } from "@examinus/contract/game";
import type { Question } from "@examinus/domain/question";
import { answerText, buckets, paperOf, teamOf, teamOver } from "./Engine.ts";
import type { Player, Room, TeamSlot, Viewer } from "./Room.ts";

export type Stage = {
  phase: GamePhase;
  index: number;
  // How many questions this screen goes through (a relay player's paper is the questions their team gave them).
  count: number;
  // The question to show and the seed that orders its choices; null: none on screen.
  serve: { q: Question; seed: number } | null;
  endsAt: number | null;
  reveal: GameView["reveal"];
  // The player is done (or their team is): the standings and the debrief are what is left.
  finished: boolean;
  showBoard: boolean;
  last: GameLast | null;
  answered: boolean;
  player: Player | undefined;
  // A teammate's question this player took and has not answered yet.
  rescuing: TeamSlot | undefined;
};

export function stageOf(room: Room, viewer: Viewer, now: number): Stage {
  const player = viewer.kind === "player" ? room.byUser.get(viewer.userId) : undefined;
  const teacherPaced = room.pacing === "teacher";
  const myTeam = player !== undefined && room.relay !== null ? teamOf(room, player) : undefined;
  const rescuing =
    player !== undefined && myTeam !== undefined
      ? [...myTeam.slots.values()].find((s) => s.rescuer === player.attemptId && s.rescueCorrect === null)
      : undefined;
  const stage: Stage = {
    phase: room.phase,
    index: room.index,
    count: player !== undefined && room.relay !== null && room.status === "running" ? paperOf(room, player).length : room.questions.length,
    serve: null,
    endsAt: null,
    reveal: null,
    finished: false,
    showBoard: false,
    last: null,
    answered: false,
    player,
    rescuing,
  };

  if (room.status === "ended" || room.phase === "ended") {
    stage.phase = "ended";
    stage.showBoard = true;
  } else if (teacherPaced) {
    if (room.status !== "running") stage.phase = "lobby";
    if (stage.phase === "question" || stage.phase === "reveal") {
      const q = room.questions[room.index];
      if (q) {
        stage.serve = { q, seed: room.seed };
        if (stage.phase === "question" && room.questionStartedAt !== null) stage.endsAt = room.questionStartedAt + room.seconds * 1000;
        // The right answer and the split only come with the reveal.
        if (stage.phase === "reveal")
          stage.reveal = {
            buckets: buckets(q, room.tally, Math.max(room.players.size - room.answeredNow.size, 0)),
            answer: answerText(q),
            answered: room.answeredNow.size,
          };
      }
    }
    stage.showBoard = stage.phase === "leaderboard";
    if (player) {
      stage.answered = room.answeredNow.has(player.attemptId);
      if (stage.phase === "reveal" || stage.phase === "leaderboard")
        stage.last = room.lastResult.get(player.attemptId) ?? { correct: false, answered: false, earned: 0 };
    }
  } else if (viewer.kind === "presenter") {
    stage.phase = room.status === "running" ? "leaderboard" : "lobby";
    stage.showBoard = true;
  } else if (player && myTeam && room.status === "running" && teamOver(room, myTeam, now)) {
    // The team's round is over: the debrief and the standings are what is left to see.
    stage.phase = "leaderboard";
    stage.finished = true;
    stage.showBoard = true;
  } else if (player && rescuing && room.status === "running") {
    // A teammate's question this player claimed: it has the normal question clock.
    stage.phase = "leaderboard";
    const q = room.byId.get(rescuing.questionId);
    if (q) {
      stage.serve = { q, seed: player.seed };
      stage.phase = "question";
      stage.endsAt = (rescuing.rescueClaimedAt ?? now) + room.seconds * 1000;
      stage.index = Math.max(stage.count - 1, 0);
    }
    stage.showBoard = true;
  } else if (room.status !== "running" || !player || player.startedAt === null) {
    stage.phase = "lobby";
  } else if (player.finished) {
    stage.phase = "leaderboard";
    stage.finished = true;
    stage.showBoard = true;
  } else {
    const q = paperOf(room, player)[player.index];
    stage.index = player.index;
    if (q) {
      stage.serve = { q, seed: player.seed };
      const mine = player.done.get(q.id);
      stage.answered = mine !== undefined;
      if (mine) {
        stage.phase = "reveal";
        stage.last = { correct: mine.correct, answered: true, earned: mine.earned };
        stage.reveal = { buckets: [], answer: room.relay !== null ? null : answerText(q), answered: 1 };
      } else {
        stage.phase = "question";
        stage.endsAt = (player.startedAt ?? now) + room.seconds * 1000;
      }
    }
    stage.showBoard = true;
  }
  return stage;
}
