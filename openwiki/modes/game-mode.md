---
type: mode
title: Game mode and Team Relay
description: How live games work — the in-memory room rebuilt from Postgres, the half-second ticker, teacher-paced and student-paced flow, points and streaks, every question type in a game (unscored essays and drawings, server-checked code and SQL with the longer wait), joining with keys and as a guest, kicking, the presenter/player/board views and their visibility rules — and the Team Relay variant.
tags: [game, kahoot, team-relay, live, points, lobby]
verified:
  - by: openwiki/0.7.1
    at: 2026-10-18T15:19:56.756Z
sources:
  - id: openwiki-source-519583888a17b249b4d2fb50
    resource: repo://apps/rpc/src/features/auth/Service.ts
  - id: openwiki-source-2ab259f1df4381f3d275346b
    resource: repo://apps/rpc/src/features/game/Engine.ts
  - id: openwiki-source-80c5584e8c202568624b5889
    resource: repo://apps/rpc/src/features/game/Handlers.ts
  - id: openwiki-source-74f2b8604a18d7a37da76a19
    resource: repo://apps/rpc/src/features/game/Jobs.ts
  - id: openwiki-source-ec586765d6c555883fedae32
    resource: repo://apps/rpc/src/features/game/Room.ts
  - id: openwiki-source-4fa29290a5e2fe1570637d70
    resource: repo://apps/rpc/src/features/game/RoomStore.ts
  - id: openwiki-source-f8fd06c1c2632378cde7454e
    resource: repo://apps/rpc/src/features/game/rules.ts
  - id: openwiki-source-a4279636b98db05359c98130
    resource: repo://apps/rpc/src/features/game/Service.ts
  - id: openwiki-source-d501b48acb9506abfa249538
    resource: repo://packages/domain/src/game.ts
  - id: openwiki-source-f825629ddf361d1c437c7461
    resource: repo://packages/domain/src/quiz.ts
generated: { by: "omp", at: "2026-10-18T15:19:56.756Z" }
---

# Game mode and Team Relay

A **game** is a session in `game` mode: a Kahoot-style **teacher-paced** game (everyone on the same question, a clock per question, a leaderboard between questions), a Wayground-style **student-paced** game (each player moves through their own shuffled paper against the session clock) or **Team Relay** (student-paced, teams unlock a password piece by piece). Games use the same attempts and answers tables as every other mode, so results, grading and the class record work unchanged, but the live play goes only through `game.*` RPCs and the game stream, never through `attempt.*` (a player must not see the whole paper).

## Session settings

`features/game/rules.ts#gameSettingsProblem`: only a game can be teacher-paced; a game needs its `game` settings (`questionSeconds` 5–300, default 20, leaderboard, streak bonus, optional relay). A game session forces one attempt, no time limit, free navigation and no marking. `gameQuestionProblems` is the only content rule: an empty quiz can't be played, and a relay can't use essays or drawings. Every other type plays: essays and drawings are **unscored** and shown to the class as a gallery after the question; code and SQL are checked on the server after the question closes.

## The room (`Room.ts`, `RoomStore.ts`, `Engine.ts`)

The authoritative state is in Postgres — the teacher-paced position (phase, question index, opened-at, pause) on `quiz_sessions`, each player's points and streak on `attempts`, every answer with its points on `answers`. A `Room` is an in-memory cache of that, loaded the first time anything touches the session after a restart (so a question continues with the time it had left), held under a per-room lock, and dropped a while after the game ends. `Engine.ts` holds the pure rules: how answers tally into buckets, `scoreAnswer`, `rankPlayers`/`recomputeBoard`, `nextIndex`, the papers, and all Team Relay decisions.

Teacher-paced games give every player the same paper, seeded from the session id (`hashSeed`); student-paced players get their own seeded order.

## Flow

<!-- openwiki: mermaid parse failed and this diagram was converted to a text fence so it does not break rendering. Fix the diagram source and restore the mermaid fence. Parser error: Heuristic: an unescaped angle bracket inside a label breaks rendering; rephrase the label. -->
```text
stateDiagram-v2
  [*] --> lobby: session.open / game.openLobby
  lobby --> running: game.start
  state running {
    question --> results: clock out / game.advance
    results --> question: game.advance
  }
  running --> ended: last question / game.end
```

- `game.start` opens the first question (teacher-paced) or starts every player's clock (student-paced). `game.advance` opens the first unplayed question after the current one, else the first unplayed one (a jump may have skipped some), and finishes when none remain. `game.pause`/`unpause` keep the open question's remaining time; `game.goTo` jumps between questions; `game.setSeconds` changes the length (an open question keeps its start and closes at once if the new length has passed).
- `game.answer`: refused when the game is over, the question closed, the game paused or the player already answered; a player's answer is reserved before scoring so it can't count twice; answers are accepted up to `gameGraceMs` (1.5 s) after the clock. Answering never closes a teacher-paced question early — the player's screen just locks in.
- **Closing a question** runs under the room lock and waits for in-flight answers: 2 s normally, up to **30 s** for code and SQL questions whose checks run on the runner or the SQL grader (`checkWaitMs`); the room shows "checking" meanwhile. Those who didn't answer are scored as timeouts.
- **Finishing** marks the room and session ended, then submits every open attempt in the background (`gradeAll`, 6 at a time) so the normal results page and grading exist.
- The **ticker** (`Jobs.ts`, every 500 ms) closes unpaused teacher-paced questions whose time is up, times out student-paced players, republishes dirty boards, finishes relays whose round ended, drops ended rooms after a while, and `resume` reloads lobby and running games when the API starts.

## Points (`packages/domain/game.ts`)

A correct answer earns `base × (1 − elapsed/limit/2)` with base 1000 (standard), 2000 (double) or 0 (none) per question's `gamePoints`; partial answers earn their fraction and break the streak; a streak adds 100 per consecutive correct answer up to 500 when the streak bonus is on. The bar chart per question comes from `tallyKeys`/`buckets` (choice ids, or right/partly/wrong for typed answers).

## Joining, guests and kicking

- `game.lookup(code)` says whether a key is a game that admits guests (used by `/join`). `game.find` admits: non-guests only in their active organization; guests only if the session allows guests; class sessions only rostered students or class members; classless sessions anyone with a roster entry while the late-join cutoff hasn't passed. `game.join` creates the attempt and puts the player in the lobby.
- `auth.joinAsGuest` (see [Auth](../security/auth-and-permissions.md)) checks the key allows guests before creating anything, makes an anonymous account named as typed (or renames a returning guest) and a roster entry in the game's organization, then joins.
- `game.kick` deletes the attempt and marks the `session_students` row removed, so the key no longer admits them; `allowRejoin` reverses it. Avatars chosen in the lobby follow the player (`avatarChanged`).
- Teacher controls require the organization permission `session: ["host"]` and ownership of the session; anything else is `NotFound`.

## Views (`Views.ts`)

One `GameView` per viewer kind, built from the room: the **presenter** (question list, buckets, board, gallery, relay progress), a **player** (their own question, lock-in and rank; never other answers or the key before results), and the **board** (`/board/<session>`, public standings). `game.standings` and `game.gallery` serve the results page after the game. See [Live sessions](live-sessions.md) for how the stream is delivered.

## Team Relay (`packages/domain/relay.ts`, `docs/team-relay.md`)

Student-paced only. In the lobby the teacher makes, deals, levels, adds or removes teams, or lets students pick. Each team gets a password whose pieces unlock as members answer their own share of the questions; wrong answers cost guesses. **Retry** lets a member retry a wrong answer while still on it (fewer points); **rescue** lets a member who finished claim a teammate's locked question for one try. Late joiners take over questions teammates haven't seen; a removed player's unanswered questions go to unfinished teammates or stay open for rescue. A team finishes when it solves the password, runs out of guesses or the round ends; the game ends when every team is finished. The presenter shows progress but hides passwords and pieces until a team finishes.
