---
type: mode
title: Exam mode and anti-cheating
description: What makes an exam session different (locked settings, honor pledge, computers only, room password, IP allowlist, allowed clients, exit password, retakes), what the browser watches and blocks, what the server enforces on every call (device, grace period, network), the audit trail, and how integrity levels and cross-student findings are computed.
tags: [exam, integrity, anti-cheating, monitoring, audit, desktop]
verified:
  - by: openwiki/0.7.1
    at: 2026-10-18T15:19:56.756Z
sources:
  - id: openwiki-source-2d1c3b0258ee1f228b2c3a57
    resource: repo://apps/rpc/src/features/attempt/Repo.ts
  - id: openwiki-source-8deb5bdeb911c1ed7e23d9c9
    resource: repo://apps/rpc/src/features/attempt/rules.ts
  - id: openwiki-source-268806dbc9bd1c40f9617d2c
    resource: repo://apps/rpc/src/features/attempt/Service.ts
  - id: openwiki-source-6a51aa0bd83d4cdbd669470f
    resource: repo://apps/rpc/src/features/attempt/Taking.ts
  - id: openwiki-source-eb9a0a3da6a63f6174374eba
    resource: repo://apps/rpc/src/features/exam/rules.ts
  - id: openwiki-source-a4bbe0475550d4ddd91259ef
    resource: repo://apps/rpc/src/features/exam/Service.ts
  - id: openwiki-source-c8528aefbdd2e514d3980662
    resource: repo://apps/web/src/features/exam/components/exam-integrity.tsx
  - id: openwiki-source-245c0ca465c1c1609a6026bc
    resource: repo://packages/domain/src/exam.ts
  - id: openwiki-source-fe857454af29a8c5fae031f4
    resource: repo://packages/domain/src/integrity.ts
generated: { by: "omp", at: "2026-10-18T15:19:56.756Z" }
---

# Exam mode and anti-cheating

Every session has **integrity settings** (`packages/domain/quiz.ts#IntegritySettings`: full screen, focus tracking, copy/paste/right-click/print blocks, second-screen block, watermark, `autoSubmitAfter`, `allowedClients`). Exam mode adds a layer of settings that can't be turned off and server-side rules that no browser can bypass. Quiz sessions get most of the same monitoring; alerts reach the teacher in every monitored session (see [Live sessions](live-sessions.md)).

## Settings per mode

`defaultIntegrity(mode)` (`packages/domain/integrity.ts`): exams turn on every block with auto-submit after 3 leaves; quizzes track focus and full screen without blocking; mastery turns the blocks off except copying; games turn off full screen and focus tracking. `integrityRules` turns the settings into the sentences students read before starting.

**Locked exam settings** (`exam.ts#examLockedSettings`): full screen, focus tracking, and the copy, paste, right-click and print blocks. `examSettingsProblem` refuses creating or updating an exam session with any of them off. Exam-only settings (`exam` jsonb): the **honor pledge** text (`defaultHonorPledge`), **computers only** (default on), the grace period and `lateJoinMinutes`. **Allowed clients** (`allowedClients`: web browser, desktop app, or both) and an **exit password** for the desktop app apply to any mode; see [Desktop app](../architecture/desktop-app.md).

## Starting an exam (`features/attempt/Taking.ts#start`)

In order: the session must be `running`; the student on the roster and not kicked; attempts left (including granted retakes); for exams the pledge accepted; the late-join cutoff not passed; the room password right; the IP in the allowlist; then the client checks from `features/exam/rules.ts` — `outdatedClient` (the desktop app below the minimum version) and `wrongClient` (a browser on a desktop-only session or vice versa, from the `x-examinus-client` header) — and `isPhoneOrTablet` on computers-only exams, judged from `Sec-CH-UA-Mobile`, `Sec-CH-UA-Platform` and the user agent the web app forwards. The attempt records the browser's device token, IP and `last_seen_at`; `flagSharing` logs `shared_device` on both attempts when another student of the session started from the same token, and `shared_network` for the same IP.

## While taking it

**Browser** (`features/exam/components/exam-integrity.tsx`): logs leaving the page or full screen with the duration (blips when toggling full screen belong to the same incident), blocks and logs copy, paste, right-click and print each per setting, watches for pasted text (more characters at once than typing), docked developer tools and split screen, detects a second monitor where the browser can tell, clears the clipboard at the start, and calls `onLimit` (auto-submit) once leaves exceed `autoSubmitAfter`. Events reach the API in batches through `attempt.recordEvents`; the heartbeat keeps `last_seen_at` fresh.

**Server** (`AttemptService.guard`, on every call of an in-progress attempt): another device is refused with a `device_changed` event (at most one a minute); in exams, the same device coming back after longer than the grace period waits for the teacher too; the IP allowlist is rechecked; a gap since `last_seen_at` logs `disconnected` with its length and a changed IP logs `network_changed`. Autosaves in quiz and exam sessions append every value to `answer_history` (`keepsHistory`), the first answer to a question that arrived faster than anyone can read logs `too_fast`, and typing histories for text answers are stored for replay.

**Teacher actions** (`features/exam/Service.ts`): `session.allowBackIn` releases the attempt's device so the next browser to check in adopts it (in exams also restarting the grace period) and records a `device_switch_allowed`/`allow_back_in` incident; `session.grantRetake` records `retake_granted` with the reason and raises that student's allowance by one (`withAllowance`); kicking removes the student from the roster. Every teacher action is an **incident** row shown on the session's report.

## Reading the results

`integrity.ts` scores each attempt from its events (each type capped so one noisy signal can't dominate), the pair findings of `analyzeSession` — rare shared wrong answers (a wrong answer shared by ≥ 3, or ≥ 2 covering 60 % of the wrong ones), essay phrase overlap and MOSS-style code fingerprint similarity (`similarity.ts`), suspicious timing, shared device and network — and the typing replay flags (pasted or robotic histories). `levelOf`: **high** at 8 points, **medium** at 3, else low. The web's `features/session/session-integrity.ts` runs the same analysis over a session's attempts for the anti-cheating page; the MCP `integrity_summary` tool returns the same findings.

`exam.record` (`ExamService.record`) assembles one student's full audit: paper version (`paperVersion(seed)`), answer history with the switches, events, incidents and typing replays.
