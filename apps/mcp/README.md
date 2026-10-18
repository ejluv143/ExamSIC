# Examinus MCP server

An [MCP](https://modelcontextprotocol.io) server over stdio (local clients) or streamable HTTP (Cloud Run). An AI client acts as a signed-in **teacher** through the same RPC API the web app uses (`apps/rpc`), so roles, ownership and organization scoping are enforced by the API, not here. Over stdio the teacher is a stored login; over HTTP each teacher signs in with OAuth.

## Run

Bun runs the TypeScript sources directly. The API must be running (`devenv up` or `npm run dev:rpc`).

```bash
EXAMINUS_EMAIL=teacher@sic.edu.ph EXAMINUS_PASSWORD=12341234 bun apps/mcp/src/main.ts
```

| Variable | Default | Meaning |
|---|---|---|
| `EXAMINUS_EMAIL`, `EXAMINUS_PASSWORD` | none, required | The teacher account. |
| `EXAMINUS_API_URL` | `http://127.0.0.1:3001` | The API (`/api/auth/*` and `/rpc`). |
| `EXAMINUS_WEB_URL` | `http://localhost:3000` | Sent as the `origin` header of the sign-in: Better Auth accepts only its own (the web app's) origin. |
| `EXAMINUS_ORGANIZATION_ID` | none | Calls `org.setActive` after sign-in. Needed when the teacher belongs to several organizations (the dev one is `org-default`). |

The sign-in happens on the first tool call. When the API answers `Unauthorized`, the server signs in again once and retries.

### Add it to a client

```bash
claude mcp add examinus -e EXAMINUS_EMAIL=… -e EXAMINUS_PASSWORD=… -- bun /abs/path/apps/mcp/src/main.ts
```

Claude Desktop and Cursor take the same command and environment in their `mcpServers` JSON (`"command": "bun"`, `"args": ["/abs/path/apps/mcp/src/main.ts"]`, `"env": { … }`).

### Over HTTP

`src/http.ts` serves the same tools at `POST /mcp` (stateless streamable HTTP: a fresh server per request, so any instance can answer). Clients sign the teacher in with standard MCP OAuth (authorization code with PKCE), which Gemini, Claude and Cursor do on their own:

1. A request without a valid token gets `401` with `WWW-Authenticate: Bearer resource_metadata="<origin>/.well-known/oauth-protected-resource/mcp"`.
2. That metadata names the authorization server: the API's Better Auth (`mcp()` plugin, `apps/rpc/src/features/auth/BetterAuth.ts`) at `<web app>/api/auth`, whose own metadata is at `<web app>/.well-known/oauth-authorization-server/api/auth`.
3. The client registers itself (`POST /api/auth/oauth2/register`, dynamic client registration) and opens `/api/auth/oauth2/authorize` in the browser. The teacher signs in on the web app's `/login` and allows the client on `/oauth/consent`.
4. The client gets a JWT access token (1 hour, with a refresh token) for this endpoint. This server checks its signature (the API's `/api/auth/jwks`), issuer, audience and type, and passes it to the API, which acts as the user it was issued to, in the organization they last picked in the web app.

```bash
npm run serve -w @examinus/mcp   # http://127.0.0.1:3002/mcp, with the API and the web app running
claude mcp add --transport http examinus https://<host>/mcp
gemini mcp add --transport http examinus https://<host>/mcp
```

| Variable | Default | Meaning |
|---|---|---|
| `EXAMINUS_MCP_RESOURCE` | `http://127.0.0.1:<PORT>/mcp` | This endpoint's public URL, the tokens' audience. Must equal the API's `MCP_RESOURCE_URL`. |
| `EXAMINUS_WEB_URL` | `http://localhost:3000` | The web app, which forwards `/api/auth` to the API: the issuer is `<EXAMINUS_WEB_URL>/api/auth`. |
| `EXAMINUS_API_URL` | `http://127.0.0.1:3001` | The API's `/rpc`. |
| `HOST`, `PORT` | `127.0.0.1`, `3002` | Listen address (the image sets `0.0.0.0:8080`). |

Clients that can't register themselves (Gemini Enterprise custom connectors) need a client made for them: `POST <web app>/api/auth/oauth2/register` with `{"client_name": "…", "redirect_uris": ["…"], "token_endpoint_auth_method": "client_secret_post"}` returns the client id and secret to enter, with `<web app>/api/auth/oauth2/authorize` and `/oauth2/token` as the URLs.

### Deploy to Cloud Run

`Dockerfile` builds from the repo root, like the API's. The API needs `MCP_RESOURCE_URL` set to the service's `/mcp` URL (and migration `0022_oauth_provider`), the web app the `/.well-known/*` rewrites in `next.config.ts`.

```bash
IMAGE="$REGION-docker.pkg.dev/$PROJECT/examinus/mcp"
docker build -f apps/mcp/Dockerfile -t "$IMAGE" . && docker push "$IMAGE"

gcloud run deploy examinus-mcp --region "$REGION" \
  --image "$IMAGE" \
  --allow-unauthenticated \
  --set-env-vars "EXAMINUS_API_URL=https://<api>,EXAMINUS_WEB_URL=https://<web>,EXAMINUS_MCP_RESOURCE=https://<service>/mcp"
```

`--allow-unauthenticated` lets MCP clients reach the service; the OAuth access token is the gate.

## Tools

Every tool returns one JSON text content. A failure returns `isError: true` and the API's tagged message (`NotFound: …`, `QuizInUse: …`, `Forbidden: …`). Outputs are compact: ids, numbers and short labels.

**Creating**

| Tool | Input | Result |
|---|---|---|
| `question_shapes` | none | Raw draft JSON shape and a note for each creatable type (`multiple_choice`, `true_false`, `blank`, `enumeration`, `numeric`, `essay`); the other types are listed as not creatable here. |
| `list_quizzes` | none | Quizzes with question count, points and sessions. |
| `get_quiz` | `quizId` | Parts with questions, answer keys and (multiple choice) choices. |
| `create_quiz` | `title`, `subject?`, `subjectArea?`, `description?`, `parts?: [{ title, instructions? }]` | `quizId` and the part ids. Letterhead and paper settings are copied from the teacher's latest quiz. |
| `add_questions` | `quizId`, `partId?` (first part), `questions: draft[]` | The new questions (ids) and the drafts that were `rejected` with the reason. `QuizInUse` once students have attempts. |
| `add_bank_questions` | `questions: draft[]`, `tags?: string[]` | New bank question ids and `rejected` drafts. `tags` become the questions' topic. |

A draft is the JSON from `question_shapes` plus optional `points` (whole or half number, default 1), `topic` (comma-separated tags, which the analytics group by) and `explanation`. Each type's `draft.decode` (`packages/domain/src/kinds/`) accepts or rejects it, the same path as the AI question helper.

**Analysis**

| Tool | Input | Result |
|---|---|---|
| `list_sessions` | `quizId?`, `classId?` | Sessions with status, mode, class and counts. |
| `session_results` | `sessionId` | Per student (latest submitted attempt): roster id, name, score/max/percent, status, time, integrity level. Summary: mean, median, highest, lowest, status breakdown, distribution in 10% bands. Per question: percent of points earned, scored and answered counts, mean time. Topic mastery. |
| `question_analysis` | `sessionId`, `questionId` | Percent fully correct, mean score, discrimination index (top vs bottom 27% by total score), answer split (choice counts, or the most common wrong answers as text), mean and median time, answer key. |
| `integrity_summary` | `sessionId` | Per student level, score and top signals; pair findings (shared wrong answers, similar text, timing, shared device or network). The typing analysis of the web page is not included. |

The numbers follow the teacher's results page: the same latest-attempt rule, `attemptScore`/`questionScore`/`percent`, a whole-percent mean, topic tags from `topicTags`, and `analyzeSession` for integrity. Only scores that are complete (no essay waiting for a teacher) enter the mean, median, highest, lowest and distribution.

**Students**

| Tool | Input | Result |
|---|---|---|
| `class_overview` | `classId` | Students with average percent, sessions taken and missed; per-session mean and median; the at-risk list (average below 60% or 2 or more missed sessions). |
| `student_report` | `classId`, `studentId` | The student's sessions (score, max, percent, status, integrity), weakest topics across sessions, and the trend from the first to the last scored session. |

Both skip game sessions (their points are not a share of the quiz score). A session counts as missed when it has ended and the student has no submitted attempt; a student's average uses only graded scores.

## Layout

- `src/server.ts`: the server and its tools. `src/main.ts` serves it over stdio (stdout carries the protocol, logs go to stderr), `src/http.ts` over HTTP.
- `src/api.ts`: typed `RpcClient` over HTTP, lazy sign-in, one re-sign-in on `Unauthorized`.
- `src/drafts.ts`: raw drafts into questions.
- `src/session-data.ts`: loading a session and the shared attempt computations.
- `src/tools/`: `creating.ts`, `analysis.ts`, `students.ts`.

`npm run typecheck -w @examinus/mcp` checks the types. There is no automated test; verify by sending `initialize`, `tools/list` and `tools/call` messages over stdio to a running API.
