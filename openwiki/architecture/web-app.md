---
type: architecture
title: Web app (apps/web)
description: Structure of the Next.js 16 web app — role areas, marketing pages, the server-only data layer that calls the API, server actions, Excel export routes, the proxy, and the browser-side runtimes it ships.
tags: [web, nextjs, react, server-actions, data-layer]
sources:
  - id: openwiki-source-999f60ece775e48a66373ded
    resource: repo://apps/web/next.config.ts
  - id: openwiki-source-99de51df25f29bfc72caf823
    resource: repo://apps/web/package.json
  - id: openwiki-source-4dd9b7e105e2ea4e0e3d61b8
    resource: repo://apps/web/scripts/copy-wasm.mjs
  - id: openwiki-source-b6c419e57a05942d7a235cd5
    resource: repo://apps/web/src/app/join/actions.ts
  - id: openwiki-source-70ee026c1dd24c875c4ea448
    resource: repo://apps/web/src/app/join/page.tsx
  - id: openwiki-source-6b282e1a60c4d4a04a8decb6
    resource: repo://apps/web/src/app/play/%5BsessionId%5D/page.tsx
  - id: openwiki-source-746db22a9a89e184abf89b18
    resource: repo://apps/web/src/app/play/layout.tsx
  - id: openwiki-source-a32fbbcb30977bf23ee74c36
    resource: repo://apps/web/src/app/teacher/assessments/%5BquizId%5D/sessions/%5BsessionId%5D/export/route.ts
  - id: openwiki-source-d7f56b5fe6128cd38b0b43d9
    resource: repo://apps/web/src/app/teacher/assessments/%5BquizId%5D/sessions/%5BsessionId%5D/taking-now.tsx
  - id: openwiki-source-2ab8595258e6a12dad110cd6
    resource: repo://apps/web/src/app/teacher/assessments/actions.ts
  - id: openwiki-source-d8c9ac2c40d0d11aedfe3116
    resource: repo://apps/web/src/lib/auth/dal.ts
  - id: openwiki-source-965022be0bd9d5bf7a192391
    resource: repo://apps/web/src/lib/data/admin.ts
  - id: openwiki-source-27fdfc8cf40b2f14479c1dd0
    resource: repo://apps/web/src/lib/data/api.ts
  - id: openwiki-source-eacd368499fd346d76fde209
    resource: repo://apps/web/src/lib/data/mock.ts
  - id: openwiki-source-5a54879bb43f2ef0a53d83d7
    resource: repo://apps/web/src/lib/data/workbooks.ts
generated: { by: "omp", at: "2026-10-09T18:11:05.062Z" }
verified:
  - by: openwiki/0.7.1
    at: 2026-10-09T18:11:05.062Z
---

# Web app (`apps/web`)

A Next.js 16 / React 19 / Tailwind 4 app. It holds no database or secrets of its own: all data comes from the API through server-side RPC (see [Overview](./overview.md)). `CLAUDE.md` warns that this Next.js version differs from older ones; read `node_modules/next/dist/docs/` before changing framework-level code. Example: request interception lives in `src/proxy.ts` (not `middleware.ts`).

## Commands

- `npm run dev:web` / `npm run build:web` from the root, or `dev` / `build` in `apps/web`. Both first run `scripts/copy-wasm.mjs`, which copies sql.js (`public/sqljs/`) and Pyodide (`public/pyodide/`) runtimes from `node_modules` so they always match the installed versions.
- Needs `API_URL` (validated at startup by `lib/api/client.ts` as an http(s) URL); `PUBLIC_API_URL` is optional for the live WebSocket.

## Route map (`src/app`)

| Area | Routes | Notes |
|---|---|---|
| Marketing | `/`, `/features`, `/how-it-works`, `/anti-cheating`, `/class-record`, `/for-students`, `/pricing`, `/privacy`, `/terms` (via `_legal`), `_landing/*` components | Public. |
| Auth | `/login`, `/register` | `/register` stays open when signed in; signing up switches accounts. |
| Guests | `/join` (key + name form, also `?id=`/`?code=` invite links), `/play/[sessionId]` (+ `results`) | Open pages. `/join` sends signed-in students to `/student/join` (keeping the key) and other roles home; anyone else plays as a guest via `auth.joinAsGuest`. `/play` has its own minimal layout with a Leave button that signs the guest out. |
| `/admin` | users list, `users/new`, `users/[userId]` | Account management. |
| `/teacher` | dashboard, `assessments` (quizzes: list, `new`, `[quizId]`, `[quizId]/edit`), sessions (`…/sessions/[sessionId]` with `live`, `present`, `integrity`, `integrity/compare`, `report/[attemptId]`), `grading`, `classes` (`new`, `import`, `[classId]` with `edit`, `attendance`, `record`, `grade-sheet`), `question-bank`, `reports`, `sessions` | Teacher workspace. |
| `/student` | dashboard, `assessments/[sessionId]` (+ `result`), `game/[sessionId]` (+ `results`), `classes`, `join`, `schedule`, `scores`, `standing` | Student workspace. |

While a quiz or exam runs, the teacher's session page shows a **taking now** aside (`sessions/[sessionId]/taking-now.tsx`) fed by the teacher live stream: students with an attempt in progress, their progress, connection and marks.

Excel downloads are route handlers (`route.ts`) under the session pages: `export` (session results), `report/[attemptId]/export` (one student's integrity report), `standings/export` (game standings). They build workbooks in `lib/data/workbooks.ts` with `write-excel-file` and return them with `Cache-Control: no-store`.

## Access control in the web app

Two layers, neither of which replaces the API's own checks:

1. **`src/proxy.ts`** runs on `/admin`, `/teacher`, `/student`, `/login`, `/register`. It reads `auth.session`, redirects anonymous users to `/login?next=…`, redirects users into their own role's home (`homeFor`), and passes Better Auth's refreshed session cookie through.
2. **`lib/auth/dal.ts`**: `readCurrentUser` (React `cache`d per request) calls `auth.session` and returns the user or `null` (for open pages like `/join`); `getCurrentUser` redirects to `/login` when it is null. The session is read from the API every request, so bans, removals and role changes take effect on the next request. `requireAdmin` / `requireTeacher` / `requireStudent` and `requirePermission(perms)` redirect to the user's home when refused; `requireGuest` sends people without a session to `/join` and other roles home. Pages call these before reading data.

Details: [Authentication and permissions](../security/auth-and-permissions.md).

## Data layer (`src/lib/data`)

All modules are `server-only`. Pages and actions never call the RPC client directly; they go through one module per domain: `teacher.ts`, `student.ts`, `admin.ts`, `attendance.ts`, `class-records.ts`, `classroom.ts`, `game.ts`, `live.ts`, `assets.ts`, `reports.ts`, `workbooks.ts`.

`lib/data/api.ts` wraps `callApi` with the current request's forwarded headers and maps declared errors to page behaviour:

| Helper | Success | `NotFound` | `Unauthorized` | Other declared errors |
|---|---|---|---|---|
| `read` | value | `notFound()` (404) | redirect `/login` | redirect `/` |
| `readOrNull` | value | `null` | redirect `/login` | redirect `/` |
| `readOrRefusal` | value | `null` | redirect `/login` | `Forbidden`/`Conflict` → `{ refused: { tag, message } }` for the page to explain |
| `write` (actions) | `{ ok }` | `{ error: "That no longer exists." }` | redirect `/login` | `{ error: message }` |
| `apiCall` / `apiValue` | `Result` / value | in `Result` | redirect `/login` | `Forbidden` → redirect `/`; rest in `Result` |

`toClass` / `toStudent` adapt contract types to the shapes in `lib/types.ts`.

**Mock data:** `lib/data/mock.ts` now only feeds the admin user form's roster picker (`admin.ts#getRoster`). `CLAUDE.md`'s note that teacher and student data are mock is outdated; they come from the API.

## Server actions

Mutations are `"use server"` modules next to the pages (`app/teacher/assessments/actions.ts`, `app/teacher/classes/actions.ts`, `app/teacher/grading/actions.ts`, `app/student/actions.ts`, `lib/live/actions.ts`, `lib/game/actions.ts`, `app/assets/actions.ts`, …). The pattern: check the role with `requireTeacher`/`requirePermission`, call a data-layer function, then `revalidatePath` the affected layouts (quiz changes revalidate both `/teacher` and `/student`). `next.config.ts` raises the server action body limit to 4 MB because a drawing answer carries every stroke point.

## Browser-side pieces

- **Quiz taking:** `components/online-exam.tsx`, `answer-inputs.tsx`, `question-navigator.tsx`, `exam-integrity.tsx`, `exam-gate.tsx`, `fullscreen-toggle.tsx` (the paper takes the whole screen); per-type inputs (`categorization-answer`, `ordering-answer`, `hotspot-input`, `drawing-canvas`, `code-editor` on CodeMirror).
- **Run button:** Python via Pyodide (`lib/run-python.ts`), JavaScript (`lib/run-js.ts`), SQL via sql.js (`lib/run-sql.ts`); other languages go through `attempt.runSampleTests`. See [Code runner](../integrations/code-runner-and-sql-grader.md).
- **Live / game:** `lib/live/client.ts` (WebSocket RPC client), `game-player.tsx` (used by both `/student/game` and the guest `/play` pages), `game-presenter.tsx` (with the teacher's pause, seconds and jump-to-question controls). See [Live sessions](../modes/live-sessions.md) and [Game mode](../modes/game-mode.md).
- **Editor:** `lib/quiz-editor.ts`, `markdown-editor.tsx`, `lib/question-import.ts` (Excel import). Markdown with KaTeX math is rendered by `components/markdown.tsx`.
- **Session watch:** `components/session-watch.tsx` signs out idle users and follows sessions that ended elsewhere.
- `next.config.ts` transpiles `@examora/contract` (TypeScript source) and rewrites `/api/auth/*` to `${API_URL}/api/auth/*`.
