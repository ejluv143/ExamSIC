// What each screen sees of a room: the presenter's, and one player's. A view never shows more than its role allows
// (a player gets no answer key and no one else's team); the whole screen is rebuilt for every change.
import {
  type GameLast,
  type GamePhase,
  type GameView,
  type RelayDebriefItem,
  type RelayMyTeam,
  type RelayRescuable,
  type RelayView,
} from "@examinus/contract/game";
import { answerKey, answerText as valueText } from "@examinus/domain/answer-text";
import { assetIdsIn } from "@examinus/domain/asset";
import { toStudentQuestion, type Question, type StudentQuestion } from "@examinus/domain/question";
import { type SqlSampleResult, type StudentSqlQuestion } from "@examinus/domain/kinds/sql";
import { paperRandom } from "@examinus/domain/shuffle";
import { Cache as MemoCache, Context, Effect, Layer } from "effect";
import { Cache } from "../../platform/Cache.ts";
import { sampleFor } from "../../platform/sql-grader.ts";
import { Assets } from "../assets/Service.ts";
import {
  answerText,
  boardOf,
  buckets,
  membersOf,
  memberView,
  paperOf,
  promptOf,
  rankedTeams,
  roundEndsAt,
  slotStateOf,
  teamOf,
  teamOver,
  unlockedPieces,
} from "./Engine.ts";
import { GameRepo } from "./Repo.ts";
import { playerRows, presenceOf, topRows, urlsFreshMs, type Player, type Room, type Team, type TeamSlot, type Viewer } from "./Room.ts";
import { RoomStore } from "./RoomStore.ts";

export type Extras = { sample: SqlSampleResult | null; urls: Record<string, string> };

const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());

export class GameViews extends Context.Service<
  GameViews,
  {
    // The signed image URLs and the SQL sample result of a question.
    readonly extras: (room: Room, q: Question) => Effect.Effect<Extras>;
    readonly view: (room: Room, viewer: Viewer) => Effect.Effect<GameView>;
  }
>()("examinus/api/GameViews") {
  static readonly layer = Layer.effect(
    GameViews,
    Effect.gen(function* () {
      const repo = yield* GameRepo;
      const rooms = yield* RoomStore;
      const assets = yield* Assets;
      const cache = yield* Cache;

      // --- The questions as screens see them ---

      // When a question opens every screen asks at once: one lookup (a grader run for SQL, signed image URLs) serves
      // them all (the memo below shares a lookup in progress), and its result is cached in Dragonfly for five
      // minutes (the signed URLs last ten). The key is the room and the question, `room:question`.
      const lookup = Effect.fn("GameViews.lookup")(function* (key: string) {
        const cached = yield* cache.getJson<Extras>(`game-extras:${key}`);
        if (cached) return cached;
        const [roomId, questionId] = key.split(":") as [string, string];
        const q = (yield* rooms.peek(roomId))?.byId.get(questionId);
        if (!q) return { sample: null, urls: {} } satisfies Extras;
        const student = toStudentQuestion(q);
        const sample = yield* sampleFor(cache, q).pipe(Effect.catchDefect(() => Effect.succeed(null)));
        const urls = yield* assets.paperUrls("", assetIdsIn(JSON.stringify(student)));
        const extras = { sample, urls } satisfies Extras;
        yield* cache.setJson(`game-extras:${key}`, extras, urlsFreshMs);
        return extras;
      });
      // Only for sharing a lookup in progress: a finished one is in Dragonfly, and a lookup that failed is not kept.
      const lookups = yield* MemoCache.makeWith(lookup, {
        capacity: 256,
        timeToLive: (exit) => (exit._tag === "Success" ? "1 second" : "0 millis"),
      });
      // The lookup runs to the end even if the screen that started it goes away, so no one waits forever.
      const extras = (room: Room, q: Question): Effect.Effect<Extras> => Effect.uninterruptible(MemoCache.get(lookups, `${room.id}:${q.id}`));

      const studentQuestion = Effect.fn("GameViews.studentQuestion")(function* (room: Room, q: Question, seed: number) {
        const found = yield* extras(room, q);
        const student = toStudentQuestion(q, paperRandom(room.detail.quiz.settings, seed, q.id));
        const question: StudentQuestion = found.sample ? { ...(student as StudentSqlQuestion), sampleResult: found.sample } : student;
        return { question, urls: found.urls };
      });

      // --- Team Relay ---

      // What the team's questions came to, once its round is over.
      const debriefOf = Effect.fn("GameViews.debrief")(function* (room: Room, team: Team) {
        if (team.debrief !== null && team.debrief.version === room.relayVersion) return team.debrief.items;
        const version = room.relayVersion;
        const rows = team.members.length === 0 ? [] : yield* repo.debriefRows(team.members);
        const byKey = new Map(rows.map((r) => [`${r.attemptId}:${r.questionId}`, r]));
        const order = new Map(room.questions.map((q, i) => [q.id, i]));
        const items = [...team.slots.values()]
          .sort((a, b) => (order.get(a.questionId) ?? 0) - (order.get(b.questionId) ?? 0))
          .flatMap((slot): RelayDebriefItem[] => {
            const q = room.byId.get(slot.questionId);
            if (!q) return [];
            const owner = slot.owner === null ? undefined : room.players.get(slot.owner);
            const row = slot.owner === null ? undefined : byKey.get(`${slot.owner}:${slot.questionId}`);
            const rescuer = slot.rescuer === null ? undefined : room.players.get(slot.rescuer);
            return [
              {
                questionId: q.id,
                prompt: promptOf(q),
                owner: owner?.name ?? "",
                answer: row ? valueText(q, row.value ?? undefined) : null,
                correct: row ? row.correct : null,
                correctAnswer: answerKey(q),
                explanation: q.explanation ?? null,
                retries: row?.tries ?? 0,
                rescuedBy: rescuer?.name ?? null,
                rescueCorrect: slot.rescuer !== null || slot.rescueCorrect !== null ? slot.rescueCorrect : null,
              },
            ];
          });
        team.debrief = { version, items };
        return items;
      });

      // The player's own team in full. Pieces of locked questions and the password stay out of it until they are earned.
      const myTeamView = Effect.fn("GameViews.myTeamView")(function* (room: Room, team: Team, p: Player, rescuing: TeamSlot | undefined, now: number) {
        const relay = room.relay!;
        const over = teamOver(room, team, now);
        const rescuable: RelayRescuable[] =
          relay.rescue && p.finished && !over && !rescuing
            ? [...team.slots.values()]
                .filter((s) => s.owner !== p.attemptId && slotStateOf(room, s) === "rescue")
                .sort((a, b) => a.boardIndex - b.boardIndex)
                .flatMap((s) => {
                  const q = room.byId.get(s.questionId);
                  return q ? [{ questionId: q.id, prompt: promptOf(q), owner: (s.owner === null ? undefined : room.players.get(s.owner)?.name) ?? "" }] : [];
                })
            : [];
        // Another try at the question on screen: tries left, and the share of its points it still earns.
        const current = !over && !p.finished && p.startedAt !== null ? paperOf(room, p)[p.index] : undefined;
        const answered = current ? p.done.get(current.id) : undefined;
        const used = current ? (p.tries.get(current.id) ?? 0) : 0;
        const retry =
          relay.retry && answered?.correct === false && used < relay.retryLimit
            ? { left: relay.retryLimit - used, percent: Math.max(0, 100 - relay.retryPenalty * (used + 1)) }
            : null;
        const proposal = team.proposal;
        return {
          id: team.id,
          name: team.name,
          members: membersOf(room, team),
          board: boardOf(room, team),
          guessesLeft: Math.max(0, relay.passwordAttempts - team.wrongGuesses),
          solved: team.solvedAt !== null,
          finished: over,
          password: over ? team.password : null,
          proposal: proposal
            ? { guess: proposal.guess, by: room.players.get(proposal.by)?.name ?? "", confirmed: proposal.confirmed, needed: team.members.length }
            : null,
          lastGuess: team.lastGuess,
          retry,
          rescuable,
          rescuing: rescuing?.questionId ?? null,
          debrief: over ? yield* debriefOf(room, team) : null,
        } satisfies RelayMyTeam;
      });

      const relayViewOf = Effect.fn("GameViews.relayView")(function* (
        room: Room,
        viewer: Viewer,
        player: Player | undefined,
        rescuing: TeamSlot | undefined,
        now: number,
      ) {
        const relay = room.relay!;
        const presenter = viewer.kind === "presenter";
        const mine = player ? teamOf(room, player) : undefined;
        const ranked = rankedTeams(room);
        const teams = ranked.map(({ team, points, rank }) => {
          const over = teamOver(room, team, now);
          return {
            id: team.id,
            name: team.name,
            members: membersOf(room, team),
            unlocked: unlockedPieces(room, team),
            pieces: team.pieces.length,
            wrongGuesses: team.wrongGuesses,
            solvedAt: iso(team.solvedAt),
            finished: over,
            points,
            rank,
            password: over && (presenter || mine?.id === team.id) ? team.password : null,
          };
        });
        const debriefs =
          presenter && room.status === "ended"
            ? yield* Effect.forEach(
                ranked,
                ({ team }) => Effect.map(debriefOf(room, team), (items) => ({ teamId: team.id, teamName: team.name, items })),
              )
            : [];
        return {
          pieceKind: relay.pieceKind,
          teamSize: relay.teamSize,
          studentPick: relay.studentPick,
          retry: relay.retry,
          rescue: relay.rescue,
          requireConsensus: relay.requireConsensus,
          roundEndsAt: iso(roundEndsAt(room)),
          teams,
          unassigned: [...room.players.values()].filter((p) => p.teamId === null).map(memberView),
          myTeamId: mine?.id ?? null,
          team: mine && player ? yield* myTeamView(room, mine, player, rescuing, now) : null,
          debriefs,
        } satisfies RelayView;
      });

      // --- The view of one screen ---

      const view = Effect.fn("GameViews.view")(function* (room: Room, viewer: Viewer) {
        const now = Date.now();
        const player = viewer.kind === "player" ? room.byUser.get(viewer.userId) : undefined;
        const presenter = viewer.kind === "presenter";
        const teacherPaced = room.pacing === "teacher";
        const count =
          player !== undefined && room.relay !== null && room.status === "running" ? paperOf(room, player).length : room.questions.length;
        let phase: GamePhase = room.phase;
        let index = room.index;
        let question: StudentQuestion | null = null;
        let urls: Record<string, string> = {};
        let endsAt: number | null = null;
        let reveal: GameView["reveal"] = null;
        let finished = false;
        let showBoard = false;
        let last: GameLast | null = null;
        let answered = false;
        const myTeam = player !== undefined && room.relay !== null ? teamOf(room, player) : undefined;
        const rescueSlot =
          player !== undefined && myTeam !== undefined
            ? [...myTeam.slots.values()].find((s) => s.rescuer === player.attemptId && s.rescueCorrect === null)
            : undefined;

        if (room.status === "ended" || room.phase === "ended") {
          phase = "ended";
          showBoard = true;
        } else if (teacherPaced) {
          if (room.status !== "running") phase = "lobby";
          if (phase === "question" || phase === "reveal") {
            const q = room.questions[room.index];
            if (q) {
              const served = yield* studentQuestion(room, q, room.seed);
              question = served.question;
              urls = served.urls;
              if (phase === "question" && room.questionStartedAt !== null) endsAt = room.questionStartedAt + room.seconds * 1000;
              if (phase === "reveal")
                reveal = {
                  buckets: buckets(q, room.tally, Math.max(room.players.size - room.answeredNow.size, 0)),
                  answer: answerText(q),
                  answered: room.answeredNow.size,
                };
            }
          }
          showBoard = phase === "leaderboard";
          if (player) {
            answered = room.answeredNow.has(player.attemptId);
            if (phase === "reveal" || phase === "leaderboard")
              last = room.lastResult.get(player.attemptId) ?? { correct: false, answered: false, earned: 0 };
          }
        } else if (presenter) {
          phase = room.status === "running" ? "leaderboard" : "lobby";
          showBoard = true;
        } else if (player && myTeam && room.status === "running" && teamOver(room, myTeam, now)) {
          // The team's round is over: the debrief and the standings are what is left to see.
          phase = "leaderboard";
          finished = true;
          showBoard = true;
        } else if (player && rescueSlot && room.status === "running") {
          // A teammate's question this player claimed: it has the normal question clock.
          phase = "leaderboard";
          const q = room.byId.get(rescueSlot.questionId);
          if (q) {
            const served = yield* studentQuestion(room, q, player.seed);
            question = served.question;
            urls = served.urls;
            phase = "question";
            endsAt = (rescueSlot.rescueClaimedAt ?? now) + room.seconds * 1000;
            index = Math.max(count - 1, 0);
          }
          showBoard = true;
        } else if (room.status !== "running" || !player || player.startedAt === null) {
          phase = "lobby";
        } else if (player.finished) {
          phase = "leaderboard";
          finished = true;
          showBoard = true;
        } else {
          const paper = paperOf(room, player);
          const q = paper[player.index];
          index = player.index;
          if (q) {
            const served = yield* studentQuestion(room, q, player.seed);
            question = served.question;
            urls = served.urls;
            const mine = player.done.get(q.id);
            answered = mine !== undefined;
            if (mine) {
              phase = "reveal";
              last = { correct: mine.correct, answered: true, earned: mine.earned };
              reveal = { buckets: [], answer: room.relay !== null ? null : answerText(q), answered: 1 };
            } else {
              phase = "question";
              endsAt = (player.startedAt ?? now) + room.seconds * 1000;
            }
          }
          showBoard = true;
        }

        const ranked = player ? room.ranks.get(player.attemptId) : undefined;
        const me = player
          ? {
              attemptId: player.attemptId,
              name: player.name,
              avatar: player.avatar,
              points: teacherPaced ? (ranked?.points ?? 0) : player.points,
              rank: ranked?.rank ?? room.players.size,
              streak: teacherPaced && phase === "question" ? player.streakBefore : player.streak,
              answered,
              last,
            }
          : null;
        const relayView = room.relay !== null ? yield* relayViewOf(room, viewer, player, rescueSlot, now) : null;
        return {
          sessionId: room.id,
          title: room.title,
          joinCode: room.joinCode,
          pacing: room.pacing,
          status: room.status,
          phase,
          questionIndex: index,
          questionCount: count,
          question,
          assetUrls: urls,
          serverNow: new Date(now).toISOString(),
          endsAt: endsAt === null ? null : new Date(endsAt).toISOString(),
          questionSeconds: room.seconds,
          paused: teacherPaced && phase === "question" && room.pausedAt !== null,
          pausedRemainingMs:
            teacherPaced && phase === "question" && room.pausedAt !== null && endsAt !== null ? Math.max(0, endsAt - room.pausedAt) : null,
          outline: presenter && teacherPaced ? room.questions.map((q, i) => ({ index: i, prompt: promptOf(q), played: room.played.has(i) })) : [],
          showLeaderboard: room.leaderboard,
          playerCount: room.players.size,
          answeredCount: presenter ? (teacherPaced ? room.answeredNow.size : [...room.players.values()].filter((p) => p.finished).length) : 0,
          players: presenter
            ? yield* cache.members(presenceOf(room.id)).pipe(
                Effect.map((members) => {
                  const online = new Set(members.map((m) => m.slice(0, m.lastIndexOf(":"))));
                  return [...room.players.values()].map((p) => ({
                    attemptId: p.attemptId,
                    name: p.name,
                    avatar: p.avatar,
                    online: online.has(p.userId),
                  }));
                }),
              )
            : [],
          removed: presenter ? [...room.removed.values()] : [],
          reveal,
          leaderboard: showBoard ? room.board.slice(0, presenter ? topRows : playerRows) : [],
          me,
          finished,
          relay: relayView,
        } satisfies GameView;
      });

      return GameViews.of({ extras, view });
    }),
  );
}
