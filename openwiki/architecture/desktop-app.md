---
type: architecture
title: Desktop app (Examinus Desktop)
description: The Tauri shell in apps/desktop that wraps the web app for exams — how it identifies itself, where it may navigate, how versions are checked by GitHub and by the API, the examinus-desktop:// signal channel, the exit-password lock during an attempt, and the per-session choice of web browser or desktop app.
tags: [desktop, tauri, exam, lockdown, versioning, client]
verified:
  - by: openwiki/0.7.1
    at: 2026-10-18T15:19:56.756Z
sources:
  - id: openwiki-source-fe064e6ab413f22e98b509a9
    resource: repo://apps/desktop/src-tauri/capabilities/default.json
  - id: openwiki-source-b43992d48a39aa89eb266f84
    resource: repo://apps/desktop/src-tauri/src/config.rs
  - id: openwiki-source-238dbc7e521883b18676d775
    resource: repo://apps/desktop/src-tauri/src/lib.rs
  - id: openwiki-source-3b5f49512727e00024224a7a
    resource: repo://apps/desktop/src-tauri/src/updates.rs
  - id: openwiki-source-6a51aa0bd83d4cdbd669470f
    resource: repo://apps/rpc/src/features/attempt/Taking.ts
  - id: openwiki-source-eb9a0a3da6a63f6174374eba
    resource: repo://apps/rpc/src/features/exam/rules.ts
  - id: openwiki-source-c5f2e8ce6392d9a7dc40b0ef
    resource: repo://apps/rpc/src/features/session/settings.ts
  - id: openwiki-source-3b0cff6f473e94546e112b49
    resource: repo://apps/rpc/src/platform/RateLimiter.ts
  - id: openwiki-source-66b56dae2bf13f678fd10339
    resource: repo://apps/web/src/features/attempt/components/desktop-exit-lock.tsx
  - id: openwiki-source-877d45ccdebedf38c4e25aad
    resource: repo://apps/web/src/lib/desktop.ts
  - id: openwiki-source-4d076fdf268e469bfe558ba0
    resource: repo://packages/domain/src/client.ts
generated: { by: "omp", at: "2026-10-18T15:19:56.756Z" }
---

# Desktop app (Examinus Desktop)

`apps/desktop` is the student client for exams: one Tauri 2 window (Rust, no front-end framework of its own) that shows the hosted web app and adds what a browser tab can't. The web app gets **no Tauri APIs** — it is a remote origin with no capability; the shell's own capability covers only its connecting page. Phases beyond the shell are planned in `docs/native-clients-plan.md`.

## What the shell is

- **Where it points.** `EXAMINUS_WEB_URL` is baked in at build time (`option_env!`) and can be overridden by the same environment variable at run time; it must be `http(s)` with a host. The window opens the web app's `/desktop` start page (sign in or join with a key), never the landing page. `EXAMINUS_RELEASES_REPO` (default `ejluv143/ExamSIC`) names the GitHub repository whose `desktop-vX.Y.Z` releases carry the installers.
- **It says what it is.** The user agent is a desktop browser string for the platform with `ExaminusDesktop/<version>` appended (it must read as a computer, because computers-only exams refuse phones by user agent), and an initialization script freezes `window.__EXAMINUS_DESKTOP__ = { version, platform }` before any page script runs. The web app reads the global through `lib/desktop.ts#desktopBridge`; the API reads the user agent through `@examinus/domain/client#clientOf` (anything without the token is `web`).
- **Navigation stays inside.** `on_navigation` allows the web app's origin and the shell's own page; an `examinus-desktop://` URL is a signal (below) and is swallowed; any other `http(s)` URL (a link in a question, the release page) opens in the system browser while the window stays put. `window.open` and `target="_blank"` links are rewritten to navigate the same window so this policy applies to them.
- **Connecting page.** The shell `HEAD`s the web app with a 10 s timeout and only navigates when it answers; otherwise its own page says "Can't reach …" with a Try again button backed by the single `retry` command.

## Two version checks

| Check | Where | Effect |
|---|---|---|
| GitHub releases | `updates.rs` at start-up: newest non-draft, non-prerelease release tagged `desktop-v…`, compared as semver | A dialog offers the release page when it is newer. Installs aren't automatic (no update signing key yet). A failed check is logged and skipped. |
| API minimum | `DESKTOP_MIN_VERSION` on the API; `outdatedClient` in `features/exam/rules.ts` compares the user agent's version | `attempt.paper` and `attempt.start` fail with `ClientOutdated` (message, version, minVersion, releasesUrl); the web app shows "Update Examinus Desktop" with the link. Browsers always pass. Raise it after a security fix so every lab machine updates before the next exam. |

Versions: `apps/desktop/package.json` and `src-tauri/Cargo.toml` must agree (CI checks), tags are `desktop-vX.Y.Z`, separate from the API's `rpc-v…` series. See [Development and CI](../operations/development-and-ci.md).

## Web browser or desktop app, per session

`integrity.allowedClients` (missing: both) lets a teacher restrict a session to the desktop app or to browsers ("Where it can be taken" in the Anti-cheating step). `wrongClient` refuses `attempt.paper`/`attempt.start` from the other kind with `Forbidden`; when the desktop app is required the message carries the releases page so the student knows where to get it. `session.create`/`update` refuse an empty list. See [Exam mode and anti-cheating](../modes/exam-mode-and-integrity.md).

## The signal channel and the exit password

The page cannot call into the shell, so it signals by **navigating to `examinus-desktop://<name>`**, which `on_navigation` intercepts, acts on and cancels:

```mermaid
sequenceDiagram
  participant W as Web page (DesktopExitLock)
  participant S as Shell (lib.rs)
  participant A as API
  W->>S: examinus-desktop://lock (attempt in progress, session has an exit password)
  Note over S: ExitLock = true
  S-->>S: CloseRequested → prevent_close()
  S->>W: eval window.__examinusExitRequested()
  W->>W: show exit-password dialog
  W->>A: attempt.verifyExitPassword { sessionId, password }
  A-->>W: { ok }
  W->>S: examinus-desktop://exit (ok) · else error shown
  Note over S: ExitLock = false, window.close()
  W->>S: examinus-desktop://unlock (attempt over / component unmounts)
```

- `ExitLock` is an atomic flag owned by the shell: `lock` sets it, `unlock` clears it, `exit` clears it and closes the window. While set, every close request (title bar, Alt+F4, Cmd+Q) is refused and the page is asked to show its dialog.
- `DesktopExitLock` mounts in the student's exam page only while an attempt is in progress, the session has an exit password (`Session.exitPasswordRequired`) and the bridge global exists; in a browser it renders nothing.
- `attempt.verifyExitPassword` (API, `Taking.verifyExitPassword`) answers `ok: true` when the session has no exit password or the student has no attempt in progress, compares the trimmed password otherwise, and counts wrong tries per attempt (10 per 10 minutes, then `Forbidden`). The password itself is stored in `quiz_sessions.exit_password` and only ever sent to the teacher (`session.get`).

The channel was verified against the web side with a faked bridge; the custom-scheme navigation path should be confirmed on real WebKitGTK and WebView2 builds before a release that relies on it.

## Building and running

`EXAMINUS_WEB_URL=http://localhost:3000 npm run dev:desktop` (Tauri prerequisites: Rust and, on Linux, webkit2gtk 4.1) runs it against the local web app; `npm run build:desktop` makes installers for the current OS. `.github/workflows/desktop.yml` runs `cargo fmt --check` and `cargo clippy -D warnings` when `apps/desktop` changes and publishes installers on a `desktop-v*` tag.
