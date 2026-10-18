---
type: mode
title: Live sessions
description: How teachers watch a session and students stay in step — the LiveHub, single-use HMAC tickets traded for a WebSocket, the teacher, student, lobby and game streams (snapshot then deltas over Dragonfly channels), teacher live actions (pause, add time, warn, lock, force submit, allow back in) recorded as incidents, the browser live client and the teacher's live view with its alerts.
tags: [live, websocket, tickets, streams, dragonfly, monitoring]
verified:
  - by: openwiki/0.7.1
    at: 2026-10-18T15:19:56.756Z
sources:
  - id: openwiki-source-782bd71403b04960c041eca5
    resource: repo://apps/rpc/src/features/live/Handlers.ts
  - id: openwiki-source-bd5e519079b29fbf053b02e9
    resource: repo://apps/rpc/src/features/live/rules.ts
  - id: openwiki-source-dd8f0a2b41aef900a4c6f561
    resource: repo://apps/rpc/src/features/live/Service.ts
  - id: openwiki-source-b5c9daee34e0450b83668587
    resource: repo://apps/rpc/src/features/session/LiveActions.ts
  - id: openwiki-source-a1bd48a4d0298464f4ff55fb
    resource: repo://apps/rpc/src/features/session/Repo.ts
  - id: openwiki-source-209c73bbaa6c6d585b043687
    resource: repo://apps/rpc/src/platform/LiveBus.ts
  - id: openwiki-source-c1400d265829dfd7233e1346
    resource: repo://apps/web/src/features/live/client.ts
  - id: openwiki-source-0e65f4f58b4e896da37b2be1
    resource: repo://apps/web/src/features/live/components/live-view.tsx
  - id: openwiki-source-0f6a5981261225c40c1dbcbb
    resource: repo://packages/contract/src/live.ts
generated: { by: "omp", at: "2026-10-18T15:19:56.756Z" }
---

# Live sessions

Everything a teacher sees change in real time, and everything a student is told while taking (pause, lock, extra time, warning, forced end), travels over one WebSocket per watcher. The API stays stateless about it: state is read from Postgres, deltas are published on `LiveBus` channels (Dragonfly pub/sub) so any API instance can serve any watcher, and the browser rebuilds from a snapshot on every (re)connect.

## Tickets (`features/live`, `packages/contract/live.ts`)

- The browser never calls `/rpc` itself, so `live.ticket { target }` is called by the web app's `/api/live/ticket` route as the signed-in user. Targets: `teacher` (the owning teacher of a session), `student` (the student or guest owning an in-progress attempt), `lobby` (a student or guest on the roster of a session), `game` (the owning teacher, or a rostered student/guest).
- A ticket is base64url JSON claims (user, role, organization, target, expiry, `jti`) signed with **HMAC-SHA256** under `BETTER_AUTH_SECRET`, valid for **60 s** and **single-use**: redeeming claims `ticket:<jti>` in Dragonfly until the ticket would have expired, so a replay on another instance also fails.
- The WebSocket endpoint `/live` is an `effect/rpc` group (`LiveRpcs`) whose `LiveAuthMiddleware` reads the ticket from the `x-live-ticket` header instead of a cookie; each stream RPC then re-checks that the claims match the requested target (`Forbidden` "This ticket isn't for that.") and that ownership still holds. Origins are checked against the API's own origin and `LIVE_ALLOWED_ORIGINS`.

## Streams

| Stream | First event | Then | Ends |
|---|---|---|---|
| `live.teacher` | `snapshot` (session, every student's row, incidents) | `student` (row replaced), `answer`, `integrity` (events batch), `incident`, `session` | scope |
| `live.student` | `state` (paused, locked, deadline, pausedAt, status) | `state` again on pause/lock/deadline change, `warning`, `ended` (`teacher`, `session_ended`, `time_up`) | after `ended`, or at once when the attempt isn't in progress |
| `live.lobby` | the `Session` | the session on every change (status, roster, settings) | scope |
| `live.game` | the viewer's `GameView` | a new view on every room change | scope |

`LiveBus.subscribe` is called **before** the snapshot is read, so nothing published in between is lost. Teacher updates are triggered by `attemptChanged` (forked, never failing or delaying the request that caused it), `sessionChanged` (a fresh snapshot), `record` (incidents) and `warn`; heartbeats reach the teacher at most every **10 s** per attempt across instances (`cache.claim("seen:…")`). Quiz details are cached 30 s because a busy session asks for the same one on every change.

## Teacher live actions (`features/session/LiveActions.ts`)

All require a running session the teacher owns and are stored as **incidents** (`hub.record`) for the timeline and report:

- `pause`/`resume`: resuming shifts the session close, the deadlines of attempts bound by their own time limit, and current question starts by the paused duration (`repo.shiftClocks`); students see `state.paused` with `pausedAt` so the clock shows the time that was left.
- `addTime` for everyone or one attempt: shifts deadlines without moving question starts.
- `warn` (a message that pops up for the student), `setLocked` (the attempt stops taking answers), `forceSubmit` (ends with `reason: "teacher"`), `allowBackIn` and `grantRetake` (see [Exam mode](exam-mode-and-integrity.md)), `kick` (removes from the roster).

Game controls are separate (`game.*`, see [Game mode](game-mode.md)); the lobby itself is in [Session lifecycle](../workflows/session-and-attempt-lifecycle.md).

## The browser client (`features/live/client.ts`)

One `LiveClient` follows one stream: fetches a ticket, connects, delivers events and reports `LiveStatus` (`connecting`, `live`, `reconnecting` — only shown if the connection isn't back within a short grace — `closed`). Reconnects use 1 s, 2 s, 4 s… up to 15 s with 0.75–1.25 jitter, start over after an attempt that received an event, and end early when the network returns or the tab is shown again. A `Forbidden` or `NotFound` refusal stops for good. `followTeacher`, `followStudent`, `followLobby` and `followGame` wrap it for pages.

## The teacher's live view (`features/live/components/live-view.tsx`)

The session page's table is driven by the teacher stream: filters (all / taking / alerts), sort by name or alerts, per-student actions, and a **taking-now** aside. In every **monitored** session — exams, and any session with focus tracking or full screen on — integrity events arrive as toasts (`exam-toasts.tsx`: left, device changed, waiting for approval, network changed…) with a sound, except alerts older than two minutes replayed by a reconnect. Exam sessions additionally track per attempt when the device last changed and was last approved so the "allow back in" button appears where needed.
