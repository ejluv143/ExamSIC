// A classic (not relay) game over the real API: HTTP RPC for the actions, the live WebSocket for what each screen sees.
// Needs an API (API_URL) on a freshly migrated and seeded database; every test makes its own game of the seeded quiz.
import { beforeAll, describe, expect, test } from "bun:test";
import {
  answerFor,
  createGame,
  demoPassword,
  ok,
  otherTeacherEmail,
  refused,
  signIn,
  studentEmail,
  students,
  teacherEmail,
  teacherPassword,
  view,
} from "./helpers.ts";

const [ann, ben, cam, , , late] = students as [string, string, string, string, string, string];

beforeAll(async () => {
  await signIn("teacher", teacherEmail, teacherPassword);
  await signIn("other", otherTeacherEmail, demoPassword);
  for (const s of [ann, ben, cam]) await signIn(s, studentEmail(s), demoPassword);
}, 30_000);

const join = async (who: string, code: string) => {
  const found = await ok(who, "game.find", { code });
  await ok(who, "game.join", { sessionId: found.sessionId });
  return found.sessionId as string;
};

describe("a teacher-paced game", () => {
  let sessionId = "";
  let code = "";

  test("creating a game opens its lobby; students find it by key and take a seat", async () => {
    const created = await createGame("teacher");
    sessionId = created.id;
    code = created.joinCode;
    expect(created.game.relay).toBeNull();
    let t = await view("teacher", sessionId);
    expect(t.phase).toBe("lobby");
    expect(t.pacing).toBe("teacher");
    expect(t.playerCount).toBe(0);
    for (const s of [ann, ben, cam]) expect(await join(s, code)).toBe(sessionId);
    t = await view("teacher", sessionId);
    expect(t.playerCount).toBe(3);
    // A player sees the lobby without the question.
    const p = await view(ann, sessionId);
    expect(p.phase).toBe("lobby");
    expect(p.question).toBeNull();
    expect(p.me).not.toBeNull();
  }, 30_000);

  test("only the teacher who owns the game may start it", async () => {
    await refused(ann, "game.start", { sessionId });
    await refused("other", "game.start", { sessionId });
    await refused(ann, "game.advance", { sessionId });
    await refused(ann, "game.end", { sessionId });
    expect((await view("teacher", sessionId)).phase).toBe("lobby");
  });

  test("a player can't answer before the game starts", async () => {
    await refused(ann, "game.answer", { sessionId, questionId: "q", value: "a" });
  });

  test("starting opens the first question; players never see the answer key", async () => {
    await ok("teacher", "game.start", { sessionId });
    const t = await view("teacher", sessionId);
    expect(t.phase).toBe("question");
    expect(t.status).toBe("running");
    expect(t.questionIndex).toBe(0);
    expect(t.endsAt).not.toBeNull();
    const p = await view(ann, sessionId);
    expect(p.phase).toBe("question");
    expect(p.question!.id).toBe(t.question!.id);
    expect(p.reveal).toBeNull();
    // The standings stay hidden while a question is open.
    expect(p.leaderboard).toEqual([]);
  });

  test("answers are scored: right earns points, wrong earns none, and a second answer is refused", async () => {
    const q = (await view(ann, sessionId)).question!;
    await ok(ann, "game.answer", { sessionId, questionId: q.id, value: answerFor(q, true) });
    await ok(ben, "game.answer", { sessionId, questionId: q.id, value: answerFor(q, false) });
    await refused(ann, "game.answer", { sessionId, questionId: q.id, value: answerFor(q, true) });
    // While the question is open a player only learns that theirs was taken, not whether it was right.
    const a = await view(ann, sessionId);
    expect(a.me!.answered).toBe(true);
    expect(a.me!.last).toBeNull();
    expect((await view(cam, sessionId)).me!.answered).toBe(false);
    expect((await view("teacher", sessionId)).answeredCount).toBe(2);
  });

  test("advance closes the question: reveal, then the leaderboard with the points", async () => {
    await ok("teacher", "game.advance", { sessionId });
    const reveal = await view("teacher", sessionId);
    expect(reveal.phase).toBe("reveal");
    expect(reveal.reveal).not.toBeNull();
    const a = await view(ann, sessionId);
    expect(a.me!.last).toMatchObject({ correct: true, answered: true });
    expect(a.me!.last!.earned).toBeGreaterThan(0);
    expect((await view(ben, sessionId)).me!.last).toEqual({ correct: false, answered: true, earned: 0 });
    // Cam didn't answer: nothing earned.
    expect((await view(cam, sessionId)).me!.last).toEqual({ correct: false, answered: false, earned: 0 });
    await ok("teacher", "game.advance", { sessionId });
    const board = await view("teacher", sessionId);
    expect(board.phase).toBe("leaderboard");
    expect(board.leaderboard[0]!.points).toBeGreaterThan(0);
    expect(board.leaderboard.map((r) => r.points)).toEqual([...board.leaderboard.map((r) => r.points)].sort((x, y) => y - x));
  });

  test("the next question opens and the game plays through to the end", async () => {
    await ok("teacher", "game.advance", { sessionId });
    let t = await view("teacher", sessionId);
    expect(t.phase).toBe("question");
    expect(t.questionIndex).toBe(1);
    for (let i = 0; i < 20 && t.phase !== "ended"; i++) {
      if (t.phase === "question") await ok(ann, "game.answer", { sessionId, questionId: t.question!.id, value: answerFor(t.question!, true) });
      await ok("teacher", "game.advance", { sessionId });
      t = await view("teacher", sessionId);
    }
    expect(t.phase).toBe("ended");
    expect(t.status).toBe("ended");
  }, 60_000);

  test("the standings rank the players by points and count what they got right", async () => {
    const st = await ok("teacher", "game.standings", { sessionId });
    expect(st.teams).toEqual([]);
    expect(st.standings).toHaveLength(3);
    const [first] = st.standings;
    expect(first.rank).toBe(1);
    expect(first.points).toBeGreaterThan(0);
    expect(first.correct).toBe(first.answered);
    const points = st.standings.map((s: { points: number }) => s.points);
    expect(points).toEqual([...points].sort((x, y) => y - x));
    const byName = Object.fromEntries(st.standings.map((s: { name: string }) => [s.name.split(" ")[0], s]));
    expect(byName["Andrea"].correct).toBeGreaterThan(byName["Miguel"].correct);
    expect(byName["Carlo"]).toBeUndefined();
    expect(byName["Bea"].answered).toBe(0);
  });

  test("an ended game takes no more answers, joins or starts", async () => {
    await signIn(late, studentEmail(late), demoPassword);
    await refused(ann, "game.answer", { sessionId, questionId: "any", value: true });
    expect(await refused(late, "game.join", { sessionId })).toContain("over");
    await refused("teacher", "game.start", { sessionId });
  });
});

describe("a student-paced game, lobby rules and kicking", () => {
  test("a player who is kicked is out; the teacher can end a game from the lobby", async () => {
    const created = await createGame("student");
    const sessionId = created.id;
    await join(ann, created.joinCode);
    await join(ben, created.joinCode);
    const lobby = await view("teacher", sessionId);
    expect(lobby.playerCount).toBe(2);
    const benPlayer = lobby.players.find((p) => p.name.startsWith("Miguel"))!;
    await ok("teacher", "game.kick", { sessionId, attemptId: benPlayer.attemptId });
    const after = await view("teacher", sessionId);
    expect(after.playerCount).toBe(1);
    expect(after.removed.map((r) => r.name)).toContain(benPlayer.name);
    await refused(ben, "game.join", { sessionId });
    await ok("teacher", "game.end", { sessionId });
    expect((await view("teacher", sessionId)).status).toBe("ended");
  }, 30_000);

  test("student-paced players move on their own once the teacher starts", async () => {
    const created = await createGame("student");
    const sessionId = created.id;
    await join(ann, created.joinCode);
    await ok("teacher", "game.start", { sessionId });
    await ok(ann, "game.next", { sessionId });
    let v = await view(ann, sessionId);
    expect(v.phase).toBe("question");
    for (let i = 0; i < 8 && !v.finished; i++) {
      if (v.phase === "question") await ok(ann, "game.answer", { sessionId, questionId: v.question!.id, value: answerFor(v.question!, true) });
      await ok(ann, "game.next", { sessionId });
      v = await view(ann, sessionId);
    }
    expect(v.finished).toBe(true);
    const st = await ok("teacher", "game.standings", { sessionId });
    expect(st.standings[0].correct).toBe(st.standings[0].answered);
    expect(st.standings[0].answered).toBeGreaterThan(0);
  }, 60_000);
});
