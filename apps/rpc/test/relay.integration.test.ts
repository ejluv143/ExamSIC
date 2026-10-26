// Team Relay over the real API: HTTP RPC for the actions and the live WebSocket for what each screen sees. Needs an
// API (API_URL, default http://127.0.0.1:3001) on a migrated database with the test fixture loaded (test/fixture): it uses the fixture's demo
// relay (sess-relay-demo, join key TEAM234, password "teamwork") and makes one more relay of its own.
import { beforeAll, describe, expect, test } from "bun:test";
import type { GameView, RelayMyTeam } from "@examinus/contract/game";
import { answerFor, call, demoPassword, finishAll, nameStarts, ok, refused, settingsOf, signIn, sleep, studentEmail, students, view } from "./helpers.ts";

const demoId = "sess-relay-demo";
const demoCode = "TEAM234";
const S = students;

beforeAll(async () => {
  await signIn("teacher", "teacher@sic.edu.ph", "12341234");
  for (const s of S) await signIn(s, studentEmail(s), demoPassword);
}, 60_000);

describe("a full relay (the fixture's demo session)", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let got: any;
  const views: Record<string, GameView> = {};
  const teamOf: Record<string, string> = {};

  test("session.get returns the relay settings and the teacher's password", async () => {
    got = await ok("teacher", "session.get", { sessionId: demoId });
    expect(got.relayPassword).toBe("teamwork");
    expect(got.session.game.relay.teamSize).toBe(3);
    expect(got.session.joinCode).toBe(demoCode);
  });

  test("invalid relay settings are refused; lobby edits are fine", async () => {
    const update = (relay: unknown) => ({ sessionId: demoId, classId: got.session.classId, ...settingsOf(got, relay) });
    expect(await refused("teacher", "session.update", update({ ...got.session.game.relay, pieceKind: "clue" }))).toContain("clue");
    await ok("teacher", "session.update", update({ ...got.session.game.relay, passwordAttempts: 3, roundMinutes: 10 }));
  });

  test("opening the lobby makes the teams; students join unassigned", async () => {
    await ok("teacher", "game.openLobby", { sessionId: demoId });
    let t = await view("teacher", demoId);
    expect(t.relay!.teams).toHaveLength(2);
    for (const s of S) {
      const found = await ok(s, "game.find", { code: demoCode });
      await ok(s, "game.join", { sessionId: found.sessionId });
    }
    t = await view("teacher", demoId);
    expect(t.relay!.unassigned).toHaveLength(6);
  }, 60_000);

  test("picking, assigning, adding a team and balancing", async () => {
    let t = await view("teacher", demoId);
    const [red, blue] = t.relay!.teams;
    await ok(S[0]!, "game.pickTeam", { sessionId: demoId, teamId: red!.id });
    await ok(S[1]!, "game.pickTeam", { sessionId: demoId, teamId: red!.id });
    await ok(S[2]!, "game.pickTeam", { sessionId: demoId, teamId: blue!.id });
    await ok("teacher", "game.setStudentPick", { sessionId: demoId, allowed: false });
    await refused(S[3]!, "game.pickTeam", { sessionId: demoId, teamId: blue!.id });
    await ok("teacher", "game.setStudentPick", { sessionId: demoId, allowed: true });
    t = await view("teacher", demoId);
    const attemptOf = (user: string) => t.players.find((p) => nameStarts(p.name, user))!.attemptId;
    await ok("teacher", "game.assignTeam", { sessionId: demoId, attemptId: attemptOf(S[3]!), teamId: blue!.id });
    await refused("teacher", "game.assignTeam", { sessionId: demoId, attemptId: attemptOf(S[4]!), teamId: "no-such-team" });
    await ok("teacher", "game.addTeam", { sessionId: demoId });
    await ok("teacher", "game.balanceTeams", { sessionId: demoId });
    t = await view("teacher", demoId);
    expect(t.relay!.teams).toHaveLength(3);
    expect(t.relay!.teams.map((x) => x.members.length)).toEqual([2, 2, 2]);
    expect(t.relay!.unassigned).toHaveLength(0);
    await refused(S[0]!, "game.start", { sessionId: demoId });
  }, 60_000);

  test("starting locks the teams and the relay settings", async () => {
    await ok("teacher", "game.start", { sessionId: demoId });
    expect(await refused("teacher", "game.addTeam", { sessionId: demoId })).toContain("locked");
    const update = { sessionId: demoId, classId: got.session.classId, ...settingsOf(got, { ...got.session.game.relay, passwordAttempts: 5 }) };
    expect(await refused("teacher", "session.update", update)).toContain("can't change");
    const t = await view("teacher", demoId);
    expect(t.status).toBe("running");
    expect(t.relay!.roundEndsAt).not.toBeNull();
    expect(t.relay!.teams.every((x) => x.password === null)).toBe(true);
    for (const team of t.relay!.teams) for (const m of team.members) teamOf[S.find((s) => nameStarts(m.name, s))!] = team.id;
  }, 30_000);

  test("what a player sees never holds the password or a locked piece", async () => {
    for (const s of S) await ok(s, "game.next", { sessionId: demoId });
    for (const s of S) {
      const v = (views[s] = await view(s, demoId));
      expect(JSON.stringify(v)).not.toContain("teamwork");
      const mine = v.relay!.team!;
      expect(mine.password).toBeNull();
      expect(mine.debrief).toBeNull();
      expect(mine.board.every((p) => p.state === "unlocked" || p.text === null)).toBe(true);
      expect(v.relay!.teams.every((x) => x.password === null)).toBe(true);
    }
  }, 60_000);

  test("a wrong answer, then one retry at a reduced price", async () => {
    const a = S[0]!;
    const q = views[a]!.question!;
    await ok(a, "game.answer", { sessionId: demoId, questionId: q.id, value: answerFor(q, false) });
    let v = await view(a, demoId);
    expect(v.me!.last?.correct).toBe(false);
    expect(v.reveal?.answer).toBeNull();
    expect(v.relay!.team!.retry).not.toBeNull();
    await ok(a, "game.retry", { sessionId: demoId });
    await refused(a, "game.retry", { sessionId: demoId });
    await ok(a, "game.answer", { sessionId: demoId, questionId: q.id, value: answerFor(q, true) });
    v = await view(a, demoId);
    expect(v.me!.last?.correct).toBe(true);
    // The retry penalty is 50 percent: a right answer earns at most half of the 1000 base points.
    expect(v.me!.last!.earned).toBeLessThanOrEqual(500);
    expect(v.me!.last!.earned).toBeGreaterThan(0);
  }, 30_000);

  test("everyone finishes their questions (Bea's first answer is wrong)", async () => {
    // Andrea already did her first one: finishAll carries on from the view.
    for (const s of S) expect((await finishAll(s, demoId, s === S[2])).finished).toBe(true);
  }, 120_000);

  test("a teammate rescues the wrong one", async () => {
    const t = await view("teacher", demoId);
    const bea = S[2]!;
    const team = t.relay!.teams.find((x) => x.id === teamOf[bea])!;
    const mate = S.find((s) => s !== bea && teamOf[s] === team.id)!;
    let vm = await view(mate, demoId);
    expect(vm.relay!.team!.rescuable).toHaveLength(1);
    const target = vm.relay!.team!.rescuable[0]!;
    expect(target.owner).toStartWith("Bea");
    await ok(mate, "game.claimRescue", { sessionId: demoId, questionId: target.questionId });
    await refused(bea, "game.claimRescue", { sessionId: demoId, questionId: target.questionId });
    vm = await view(mate, demoId);
    expect(vm.relay!.team!.rescuing).toBe(target.questionId);
    expect(vm.question).not.toBeNull();
    await ok(mate, "game.rescue", { sessionId: demoId, questionId: target.questionId, value: answerFor(vm.question!, true) });
    vm = await view(mate, demoId);
    expect(vm.relay!.team!.board.every((p) => p.state === "unlocked")).toBe(true);
  }, 60_000);

  test("a wrong password costs a try, then the right one solves (and is rate limited)", async () => {
    const a = S[0]!;
    await ok(a, "game.submitPassword", { sessionId: demoId, guess: "wrongword" });
    expect(await refused(a, "game.submitPassword", { sessionId: demoId, guess: "teamwork" })).toContain("Wait");
    let v = await view(a, demoId);
    expect(v.relay!.team!.guessesLeft).toBe(2);
    expect(v.relay!.team!.lastGuess?.correct).toBe(false);
    await sleep(2200);
    await ok(a, "game.submitPassword", { sessionId: demoId, guess: "  TeamWork " });
    v = await view(a, demoId);
    expect(v.relay!.team!.solved).toBe(true);
    expect(v.relay!.team!.password).toBe("teamwork");
    expect(v.relay!.team!.debrief).not.toBeNull();
    expect(JSON.stringify(await view(S[4]!, demoId))).not.toContain("teamwork");
    await refused(a, "game.submitPassword", { sessionId: demoId, guess: "teamwork" });
  }, 60_000);

  test("the game ends when every team is done, and the standings show the teams", async () => {
    for (const s of [S[2]!, S[4]!]) {
      for (let i = 0; i < 3; i++) {
        await call(s, "game.submitPassword", { sessionId: demoId, guess: `nope${i}` });
        await sleep(2200);
      }
    }
    await sleep(1500);
    const t = await view("teacher", demoId);
    expect(t.status).toBe("ended");
    expect(t.relay!.debriefs).toHaveLength(3);
    expect(t.relay!.teams.every((x) => x.password !== null)).toBe(true);
    const st = await ok("teacher", "game.standings", { sessionId: demoId });
    expect(st.teams).toHaveLength(3);
    expect(st.teams[0].solvedMs).not.toBeNull();
    expect(st.standings.every((x: { team: string | null }) => x.team !== null)).toBe(true);
    expect(st.standings.some((x: { rescues: number }) => x.rescues === 1)).toBe(true);
  }, 120_000);
});

describe("consensus, kick and late join (a relay the test creates)", () => {
  let sessionId = "";
  let code = "";
  let teamA: RelayMyTeam;
  let mate = "";

  test("a relay with consensus is created and its lobby opened", async () => {
    const got = await ok("teacher", "session.get", { sessionId: demoId });
    const relay = { ...got.session.game.relay, requireConsensus: true, teamCount: 2, retry: false, rescue: false };
    const created = await ok("teacher", "session.create", {
      quizId: got.session.quizId,
      classId: got.session.classId,
      startNow: true,
      ...settingsOf(got, relay),
    });
    sessionId = created.id;
    code = created.joinCode;
    expect(created.game.relay.requireConsensus).toBe(true);
    for (const s of S.slice(0, 4)) await ok(s, "game.join", { sessionId });
    await ok("teacher", "game.balanceTeams", { sessionId });
    await ok("teacher", "game.start", { sessionId });
    for (const s of S.slice(0, 4)) await ok(s, "game.next", { sessionId });
    expect(code).toHaveLength(7);
  }, 60_000);

  test("a proposed password waits for every member to confirm", async () => {
    const a = S[0]!;
    teamA = (await view(a, sessionId)).relay!.team!;
    const mateName = teamA.members.find((m) => !nameStarts(m.name, a))!.name;
    mate = S.find((s) => nameStarts(mateName, s))!;
    await finishAll(a, sessionId);
    await finishAll(mate, sessionId);
    await ok(a, "game.submitPassword", { sessionId, guess: "teamwork" });
    let vm = await view(mate, sessionId);
    expect(vm.relay!.team!.proposal).toMatchObject({ needed: 2, by: expect.stringMatching(/^Andrea/) });
    expect(vm.relay!.team!.proposal!.confirmed).toHaveLength(1);
    expect(vm.relay!.team!.lastGuess).toBeNull();
    await refused(a, "game.submitPassword", { sessionId, guess: "teamwork" });
    await ok(mate, "game.rejectPassword", { sessionId });
    vm = await view(mate, sessionId);
    expect(vm.relay!.team!.proposal).toBeNull();
    await ok(a, "game.submitPassword", { sessionId, guess: "teamwork" });
    await ok(a, "game.confirmPassword", { sessionId });
    vm = await view(mate, sessionId);
    expect(vm.relay!.team!.solved).toBe(false);
    await ok(mate, "game.confirmPassword", { sessionId });
    vm = await view(mate, sessionId);
    expect(vm.relay!.team!.solved).toBe(true);
    expect(vm.relay!.team!.password).toBe("teamwork");
  }, 120_000);

  test("kicking a member hands their questions to the teammate; a late joiner takes some back", async () => {
    const t = await view("teacher", sessionId);
    const teamB = t.relay!.teams.find((x) => x.id !== teamA.id)!;
    const [x, y] = teamB.members;
    const yUser = S.find((s) => nameStarts(y!.name, s))!;
    const before = await view(yUser, sessionId);
    await ok("teacher", "game.kick", { sessionId, attemptId: x!.attemptId });
    const after = await view(yUser, sessionId);
    expect(before.questionCount).toBeLessThan(4);
    expect(after.questionCount).toBe(4);
    const late = S[4]!;
    await ok(late, "game.find", { code });
    await ok(late, "game.join", { sessionId });
    const d = await view(late, sessionId);
    const y2 = await view(yUser, sessionId);
    expect(d.relay!.myTeamId).toBe(teamB.id);
    expect(d.questionCount).toBeGreaterThanOrEqual(1);
    expect(d.questionCount + y2.questionCount).toBe(4);
    await ok(late, "game.next", { sessionId });
    expect((await finishAll(late, sessionId)).finished).toBe(true);
    expect((await finishAll(yUser, sessionId)).finished).toBe(true);
    await ok("teacher", "game.end", { sessionId });
  }, 120_000);
});
