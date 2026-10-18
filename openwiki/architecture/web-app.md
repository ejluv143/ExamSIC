---
type: architecture
title: Web app (apps/web)
description: How the web app is organised (thin app routes over features with data.ts, actions.ts and components), how it reaches the API (callApi, read/write helpers, forwarded headers), the auth DAL and role gates, the live WebSocket client, the question-kinds UI registry, guest pages, and security headers.
tags: [web, vinext, vite, react, features, auth, live, security]
verified:
  - by: openwiki/0.7.1
    at: 2026-10-18T15:19:56.756Z
sources:
  - id: openwiki-source-99de51df25f29bfc72caf823
    resource: repo://apps/web/package.json
  - id: openwiki-source-4dd9b7e105e2ea4e0e3d61b8
    resource: repo://apps/web/scripts/copy-wasm.mjs
  - id: openwiki-source-191588e76a087cc0f59e7a1d
    resource: repo://apps/web/src/app/api/live/ticket/route.ts
  - id: openwiki-source-70ee026c1dd24c875c4ea448
    resource: repo://apps/web/src/app/join/page.tsx
  - id: openwiki-source-6b282e1a60c4d4a04a8decb6
    resource: repo://apps/web/src/app/play/%5BsessionId%5D/page.tsx
  - id: openwiki-source-a32fbbcb30977bf23ee74c36
    resource: repo://apps/web/src/app/teacher/assessments/%5BquizId%5D/sessions/%5BsessionId%5D/export/route.ts
  - id: openwiki-source-10af61cf40855a5aa440caf6
    resource: repo://apps/web/src/components/question-kinds/registry.ts
  - id: openwiki-source-c1400d265829dfd7233e1346
    resource: repo://apps/web/src/features/live/client.ts
  - id: openwiki-source-966d5c7224277c941eb70493
    resource: repo://apps/web/src/lib/api/helpers.ts
  - id: openwiki-source-d8c9ac2c40d0d11aedfe3116
    resource: repo://apps/web/src/lib/auth/dal.ts
  - id: openwiki-source-262ab3618fca33bf3547acb7
    resource: repo://apps/web/src/lib/refresh.ts
  - id: openwiki-source-4b9e2d562004bc8cd9dec97b
    resource: repo://apps/web/src/lib/security-headers.ts
generated: { by: "omp", at: "2026-10-18T15:19:56.756Z" }
---

# Web app (`apps/web`)

The UI for every role, served by **vinext** (Vite) with React 19 and Tailwind: `/admin`, `/teacher`, `/student`, `/organizations`, the guest areas `/join` and `/play`, `/desktop` (the desktop shell's start page) and the marketing/legal pages. It calls the API **only from the server** (pages, server components, server actions, route handlers); the browser opens no `/rpc` request itself. The two exceptions that leave the server are the live WebSocket (with a ticket) and direct uploads/reads against the S3 bucket.

## Layout

```text
apps/web/src/
  app/                  routes only: page.tsx, layout.tsx, loading.tsx, route.ts — thin
  features/<feature>/   admin, ai, assets, attempt, attendance, auth, bank, classes, exam, game, live, mastery, organization, quiz, records, session
    data.ts             server-side reads/writes over RPC
    actions.ts          'use server' actions
    components/         the feature's client and server components
  components/           shared UI, and question-kinds/ (editor, input, review, print per type)
  lib/                  api/ (RPC client + helpers), auth/dal.ts, security-headers, format, theme, device, desktop…
  proxy.ts              routing by role, session-cookie refresh, security headers with a per-request CSP nonce
```

`npm run dev` / `build` first run `scripts/copy-wasm.mjs`, which copies the sql.js and Pyodide runtimes into `public/` so browser-side SQL and Python match the installed versions.

## Talking to the API

- `lib/api/client.ts`: one `ManagedRuntime` with an Effect `RpcClient` typed from `ApiRpcs`. `callApi(call, headers)` returns declared errors in a `Result` and throws on transport errors; `forwardedHeaders` passes the cookie, user agent, IP and client hints; `applyCookies` sets the session cookies the API returns (sign-in, refresh, guest join).
- `lib/api/helpers.ts` maps results to page behaviour: `read` → `notFound()` on `NotFound`, `/login` on `Unauthorized`, home on anything else; `readOrNull` returns `null` for `NotFound`; `readOrRefusal` hands the page `{ refused: { tag, message } }` for refusals it explains itself (device approval, computers only, wrong client…); `write` returns `{ ok }` or `{ error, tag }` for forms.
- Feature `data.ts` modules wrap these; feature `actions.ts` modules are the `'use server'` entry points and call `lib/refresh.ts#refresh()`, which revalidates both the `/teacher` and `/student` layouts.

## Who is signed in (`lib/auth/dal.ts`)

Every read calls the DAL, so pages stay protected even if the proxy redirect is skipped. `readCurrentUser` asks the API for `auth.session` once per request (`cache`) and returns `null` when signed out; `getCurrentUser` redirects to `/login` instead. `requireRole`/`requireTeacher`/`requireStudent`/`requireAdmin` send a user of another role to their home; `requireOrg` sends users without an active organization to the picker; `requirePermission(permissions)` applies the domain's `can` and redirects home when the membership lacks it; `requireGuest` sends visitors without a session to `/join` and signed-in non-guests home. Because the session is re-read on each request, bans, removals and role changes apply on the next request.

`proxy.ts` does the same routing before rendering (anonymous → `/login?next=…`, wrong area → home, `/login` while signed in → home) and attaches the security headers from `lib/security-headers.ts`: fixed headers on everything and a `Content-Security-Policy` with a fresh nonce per page; Nitro's route rules add the fixed ones to static output.

## Live updates in the browser

`features/live/client.ts` follows one stream: it fetches a ticket from the web app's `/api/live/ticket` route (which asks the API as the signed-in user), opens the WebSocket, delivers events to the page and reports a `LiveStatus` (`connecting`, `live`, `reconnecting`, `closed`), reconnecting with backoff and a fresh ticket after a drop. `followTeacher`, `followStudent`, `followLobby` and `followGame` wrap it for the four streams. See [Live sessions](../modes/live-sessions.md).

## Question kinds in the UI

`components/question-kinds/registry.ts` maps every `QuestionType` to a `QuestionUi` with `Editor`, `Input`, `Review` and `Print` components plus an editor model (`views/editor-model.ts`: validation, placeholders, summaries, Excel import parsing). It is typed on the union like the domain registry, so a new type needs both a domain kind and a UI module. The quiz editor, the exam page, grading and the printed paper only look the type up. See [Quizzes and questions](../concepts/quizzes-and-questions.md).

## Guests and joining

`/join` (also `?id=KEY` or `?code=KEY` from invite links and QR codes) is where a key leads: a signed-in student is sent to `/student/join` with the key, other signed-in roles go home, and anyone else joins as a guest with a name. Guests play at `/play/<session>` behind `requireGuest` under a minimal layout whose Leave button signs them out.

## Notable server routes

- `/api/live/ticket` (POST): the browser's way to get a live ticket; the route calls `live.ticket` with the forwarded cookies.
- Excel exports (session results, standings, integrity report) are route handlers that build the workbook on the server (`features/session/workbooks.ts`) and serve it with `Cache-Control: no-store`.
- The teacher's session page renders a taking-now aside from the teacher live stream, and the student's pages switch between the lobby, the intro, the paper, the mastery player and the result from one route.
