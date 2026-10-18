# Examinus MCP server

An [MCP](https://modelcontextprotocol.io) server over stdio (local clients) or streamable HTTP (Cloud Run). An AI client acts as one signed-in **teacher** through the same RPC API the web app uses (`apps/rpc`), so roles, ownership and organization scoping are enforced by the API, not here.

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

`src/http.ts` serves the same tools at `POST /mcp` (stateless streamable HTTP: a fresh server per request, so any instance can answer). Every request must send `Authorization: Bearer $EXAMINUS_MCP_TOKEN`; anything else gets `401`.

```bash
EXAMINUS_MCP_TOKEN=… EXAMINUS_EMAIL=… EXAMINUS_PASSWORD=… npm run serve -w @examinus/mcp   # http://127.0.0.1:3002/mcp
claude mcp add --transport http examinus https://<host>/mcp --header "Authorization: Bearer …"
```

| Variable | Default | Meaning |
|---|---|---|
| `EXAMINUS_MCP_TOKEN` | none, required | Shared bearer token for HTTP clients. Anyone holding it acts as the configured teacher. |
| `HOST`, `PORT` | `127.0.0.1`, `3002` | Listen address (the image sets `0.0.0.0:8080`). |

### Deploy to Cloud Run

`Dockerfile` builds from the repo root, like the API's. Keep the token and password in Secret Manager:

```bash
printf %s "$(openssl rand -hex 32)" | gcloud secrets create examinus-mcp-token --data-file=-
printf %s "$TEACHER_PASSWORD" | gcloud secrets create examinus-mcp-password --data-file=-

IMAGE="$REGION-docker.pkg.dev/$PROJECT/examinus/mcp"
docker build -f apps/mcp/Dockerfile -t "$IMAGE" . && docker push "$IMAGE"

gcloud run deploy examinus-mcp --region "$REGION" \
  --image "$IMAGE" \
  --allow-unauthenticated \
  --set-env-vars "EXAMINUS_API_URL=https://<api>,EXAMINUS_WEB_URL=https://<web>,EXAMINUS_EMAIL=teacher@…" \
  --set-secrets "EXAMINUS_MCP_TOKEN=examinus-mcp-token:latest,EXAMINUS_PASSWORD=examinus-mcp-password:latest"
```

`--allow-unauthenticated` lets MCP clients reach the service; the bearer token is the gate. The service account needs `roles/secretmanager.secretAccessor` on both secrets.

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
