---
type: concept
title: Exam mode and anti-cheating
description: Per-session anti-cheat settings, what the browser detects and blocks, what the API enforces (device binding, IP allowlist, room password, late join, computers-only, pledge), exam-mode locked settings and device-switch approval, and how integrity levels and cross-student comparisons are computed.
tags: [exam, integrity, anti-cheating, security, device, similarity]
verified:
  - by: openwiki/0.7.1
    at: 2026-10-09T17:47:22.617Z
sources:
  - id: openwiki-source-224e2f79ce2d864ccf06441f
    resource: repo://apps/rpc/src/handlers/AttemptHandlers.ts
  - id: openwiki-source-0fe99b469d773c901e48900f
    resource: repo://apps/rpc/src/handlers/SessionHandlers.ts
  - id: openwiki-source-41098bc868287ff2e00f84d0
    resource: repo://apps/rpc/src/modes/exam.ts
  - id: openwiki-source-4bb34f6af86e12cdb2be42c6
    resource: repo://apps/web/src/components/exam-integrity.tsx
  - id: openwiki-source-b63144089c7429d928005e30
    resource: repo://packages/contract/src/exam.ts
  - id: openwiki-source-b9f8572d40eaa521028cf23b
    resource: repo://packages/contract/src/integrity.ts
generated: { by: "omp", at: "2026-10-09T17:47:22.617Z" }
---

# Exam mode and anti-cheating

Anti-cheating has three layers. None of them changes a score; they **deter, log and point the teacher at where to look**.

| Layer | Where | Trust |
|---|---|---|
| Browser monitoring and blocking | `apps/web/src/components/exam-integrity.tsx` (`useIntegrity`) | Deterrent only; a browser can't stop a second device. Events are sent to the API. |
| Server enforcement | `apps/rpc/src/handlers/AttemptHandlers.ts` (`guard`, `attempt.start`), `modes/exam.ts`, `network.ts` | Authoritative. |
| After-the-fact analysis | `packages/contract/src/integrity.ts`, `similarity.ts`; web `lib/session-integrity.ts` | Computes per-attempt levels and suspicious pairs for the teacher. |

## Settings

`IntegritySettings` (`packages/contract/src/quiz.ts`), stored in `quiz_sessions.integrity`: `requireFullscreen`, `trackFocus`, `blockSecondScreen` (Chrome/Edge only), `blockRightClick`, `blockCopy`, `blockPaste`, `allowPasteInCode`, `blockPrint`, `clearClipboardOnStart`, `watermark`, `autoSubmitAfter` (leaves allowed before auto-submit; null = never).

`defaultIntegrity(mode)`: exams turn everything on with `autoSubmitAfter: 3`; quizzes keep full screen and focus tracking but no blocking; mastery only blocks copy; games disable full screen and focus tracking.

Session-level prevention fields: `room_password`, `ip_allowlist` (CIDR or addresses), `late_join_minutes`, `one_question_at_a_time` + `question_time_limit_seconds`, `navigation`, `max_marked`. One device per attempt and the heartbeat are always on.

## Browser side

`useIntegrity` (active only while answering):

- Logs leaving the page, switching apps / Alt+Tab, leaving full screen, mouse leaving, window resize, with durations. Brief blips while toggling full screen merge into one incident.
- Blocks and logs right-click, copy/cut, paste/drop, printing — each only if its setting is on; `allowPasteInCode` permits paste in the code editor (still logged and visible in typing replay).
- Detects bulk text appearing at once (`bulk_input`), docked developer tools (`devtools_open`), split screen, and a second screen via `screen.isExtended`.
- Clears the clipboard on start (needs a user click), draws the watermark.
- After more than `autoSubmitAfter` leaves, calls `onLimit`, which submits.
- Events go to `attempt.recordEvents`; `attempt.heartbeat` runs about every 15 s. Events arriving after submit are dropped; the server keeps at most 500 per call with valid times (`cleanEvents`).

Event types are a fixed list (`integrityEventTypes`) mirrored in a Postgres enum.

## Server enforcement

### Starting (`attempt.start`)

In order, for a new attempt: phone/tablet refusal on computers-only exams; session must be `running`; attempts not used up (plus retakes granted); exam requires `pledgeAccepted` (stored as `pledge_accepted_at`); late-join cutoff from the session's start; room password; IP allowlist. The attempt records `device_id` (a random browser token), `ip` and `last_seen_at`. `flagSharing` then logs `shared_device` on both students when another student of the session started from the same browser token, and `shared_network` for the same IP. A concurrent second start resolves to the same in-progress attempt via the unique `(session, student, attempt_number)` index.

### Every call on an in-progress attempt (`guard`)

Used by `paper`, `start` (resume), `saveAnswer`, `submit`, `recordEvents`, `heartbeat`, `goTo`, `setMarked`, mastery calls:

- **Another device** (different `deviceId`, or none when required) → `Conflict`, and a `device_changed` event at most once a minute.
- **Exam, away too long**: last check-in older than `deviceGraceMinutes` (default 5) → `Conflict` with `deviceApprovalMessage`, even on the same device.
- **IP allowlist** checked again (except on `submit`: handing in is always allowed).
- Gaps over 30 s since the last check-in become `disconnected` events with duration; a changed IP becomes `network_changed`.
- Updates `last_seen_at`; an attempt from before device tracking adopts the first browser to check in.

`requireWritable` additionally refuses changes while the session is **paused** or the attempt is **locked** by the teacher (see [Live sessions](./live-sessions.md)).

Server-side detections also include `too_fast` (first answer to a question within `tooFastMs` = 2 s of it appearing), `auto_submitted` and `late_submit` (see [API server](../architecture/api-server.md#submitting-attempts-quizzessubmit)).

### Phone detection

`isPhoneOrTablet` checks `Sec-CH-UA-Mobile`, `Sec-CH-UA-Platform` and the user agent (forwarded by the web app); the browser additionally checks `maxTouchPoints` for iPads posing as Macs. Enforced in `attempt.paper` and `attempt.start` via `phoneRefusal`.

## Exam mode specifics

- **Locked settings** (`examLockedSettings`): full screen, focus tracking, one screen, no right-click/copy/paste/print, clipboard clear, watermark. `session.create`/`update` refuse an exam with any of them off (`examSettingsProblem`); teachers may only add stricter rules.
- **Defaults** (`examDefaults`): computers only, auto-submit after 3, late join 15 min, 1 attempt, results released manually, device grace 5 min. `exam` jsonb holds `computersOnly`, `honorPledge` (default text in `defaultHonorPledge`), `deviceGraceMinutes`.
- **Device switch approval:** `session.allowBackIn` clears the attempt's `device_id`/`ip` so the next browser to check in owns it; in exams it also resets `last_seen_at` so the waiting time isn't held against the student. Recorded as incident `device_switch_allowed` (or `allow_back_in` outside exams).
- **Retakes:** `session.grantRetake` (exam only, finite attempts, session not ended, no attempt in progress, reason required) records a `retake_granted` incident; `grantedRetakes` counts them and `withAllowance` adds them to that student's `attemptsAllowed`.
- **Audit trail:** every `saveAnswer` in an exam appends to `answer_history`, and submit appends the final value if it differs; score changes after release go to `grade_changes` with a reason (see [Grading](../workflows/grading-and-results.md)).
- **Paper version:** `paperVersion(seed)` gives a code like `A7K2-9QX`, shown on results, grading and reports so two papers can be told apart.
- `session.examRecord` returns one attempt's details, incidents, answer history and grade changes for the integrity report page and its Excel export.

## Integrity levels and comparisons

`integrityReport(events)` summarises counts, minutes away/out of full screen and a timeline. `eventSignals` turns it into capped points (leaving up to 6, device change 4, shared device 4, bulk input up to 6, devtools 3, …). `levelOf`: **high ≥ 8, medium ≥ 3, else low**. The live view uses `eventsLevel` (events only).

After a session, `analyzeSession` (run in the web app by `lib/session-integrity.ts` for the integrity and compare pages) adds pair findings between students' latest submitted attempts:

| Pair kind | Detector | Points |
|---|---|---|
| `wrong_answers` | Same rare wrong answers | 2 + 4 × strength |
| `essay_text` | `similarTexts`: shared three-word phrases ≥ 50 % (essays ≥ 25 words) | 5 |
| `code` | `similarPairs`: MOSS-style winnowing over normalised tokens (names, literals, comments, starter code ignored), ≥ 75 % | 5 |
| `timing` | Answered the same questions at the same moments | 3 |
| `device` / `network` | Same browser / IP | 0 (already scored from events) |

Pair points per attempt cap at 10. Typing histories that look pasted or robotic (`lib/typing.ts#analyzeTyping`) add up to 6. All of this is advisory output on `/teacher/.../integrity`, `/integrity/compare` and `/report/<attempt>`.
