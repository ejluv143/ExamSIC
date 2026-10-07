# Examora (working name)

Quizzes and exams for colleges and universities: live quizzes like Wayground, plus timed, scheduled exams with essay grading.

## Decisions so far
- Audience: colleges and universities.
- Scale: up to 500 players in one live quiz, or 500 students taking one exam at the same time.
- Stack: Next.js + Tailwind (`apps/web/`); Effect 4 + PostgreSQL (Drizzle) API (`apps/rpc/`), called over typed Effect RPC defined in `packages/contract/`; code runner on Docker (`apps/runner/`). Live updates run over an Effect RPC stream on a WebSocket; Redis comes when there is more than one API server.
- Auth: [Better Auth](https://better-auth.com) in `apps/rpc/` (email/password, optional Google), stored in PostgreSQL through Drizzle. The web app signs in through RPC and sets the session cookies the API returns; it forwards `/api/auth/*` (the Google callback) to the API.
- Roles: admin, teacher and student, each with its own area (`/admin`, `/teacher`, `/student`). Permissions per role live in `packages/contract/src/permissions.ts`; the API checks them in its RPC handlers, Better Auth's admin plugin enforces account management, and the web app checks them with `requirePermission` for pages and mock data.
- Hosting: web on Vercel; the API needs a host that keeps WebSocket connections open (Fly.io / Railway / Render).

## Features
Everything below works today. Accounts, quizzes, sessions, attempts and the question bank are stored in PostgreSQL through the API; classes, rosters, class records and attendance still run on demo data in `apps/web/src/lib/data/` until they move to the API.

### Teachers
- **Quizzes.** A quiz is reusable content: parts of questions, a test-paper layout and shuffling. A quiz with no session shows as Draft. A Subject dropdown decides the question types offered: General (multiple choice, blank, matching, enumeration), English (+ true/false, essay), Mathematics (+ numeric), Science, and Programming / IT (+ code, SQL query). "Show all question types" lifts the limit. Questions come from the editor, the question bank, or an Excel import.
- **Markdown.** Prompts, choices, matching items, part instructions, the quiz description, students' essay answers and teacher feedback are markdown (bold, lists, tables, links, code), sanitised, with math written in LaTeX between `$…$` (or `$$…$$`). Every text box has a small toolbar and a Preview tab.
- **Question types.**
  - **Multiple choice:** one correct choice, or several (students tick every correct one), all-or-nothing or partial credit.
  - **Blank:** `identification` (one answer box), `inline` (blanks inside a sentence) or `cloze` (a passage with many blanks). Blanks are written `{{answer|alternative}}` in the prompt, with an "Insert blank" button. Cloze blanks are typed, picked from a dropdown (options listed in the editor) or taken from a shared word bank with extra distractor words. Case sensitivity is per question.
  - **Matching:** left items, right items and extra distractors on the right; students pick the right item for each left item (a dropdown, so it works on phones).
  - **True/false, enumeration, numeric, essay (rubric rows with points), code and SQL.**
  - **Drawing:** students draw on a canvas (pen, highlighter, eraser, colours, thicknesses, text labels, undo/redo, pressure on tablets) and/or upload or take up to three photos of work done on paper; the teacher chooses which are allowed (and "Camera only" to refuse gallery picks), an optional background image to draw on, the canvas size, a rubric and the points. Graded by hand like an essay.
- **Parts.** You create, rename, reorder and delete parts, each with markdown instructions, and move questions between them (drag, or "Move to part" and up/down on a phone). A part can shuffle its questions or draw N of its M questions for each student (a pool). The printed paper uses your parts, with points per part ("Part II – Matching (10 pts)").
- **Points.** Every question has points (whole or half, default 1) and, per question, "all or nothing" or "partial credit". Points are shared equally among a question's blanks, pairs, items or tests, or you can set a weight for each. Essay rubric rows carry points that add up to the question's points. Each part and the whole quiz show live totals; bulk-set the points of a whole part or of one question type; every question in a pool needs the same points. A game-points setting (Standard, Double, None) is stored for the game mode and only shown under Advanced. Automatic scores are stored as a fraction and manual scores in points, so changing a question's points recalculates everyone's score.
- **Images.** Add pictures to prompts, part instructions and the quiz description ("Insert image", drag and drop, or paste a file), to multiple-choice options (shown as a grid) and to matching items. PNG, JPEG, WebP or GIF up to 5 MB; the browser shrinks them to 2000 px on the longest side and strips EXIF (location) before uploading. Alt text is required before a quiz can be saved and shows on the printed paper if an image can't load. Duplicating a quiz reuses the same images. Images sit in a private S3 bucket and are shown through short-lived signed URLs, so students can't see question images before the session opens.
- **Randomizing.** Shuffling is seeded from each attempt, so a student's paper is the same after a reload and the teacher sees exactly what they saw. The quiz can shuffle the order of parts, the questions within parts, multiple-choice choices, the matching right column and the cloze dropdowns and word bank; pools draw N questions per student. The answer key and scoring are never affected by the order.
- **Sessions.** "Start a session" on a quiz picks a class and its students, the mode (Quiz or Exam), schedule, time limit, results release, retakes (none, 1, 2, 3 or unlimited; the Try again button follows), anti-cheating rules and "Count in the class record". A session is scheduled until it opens (or you press Start), runs, and ends at its close time, when you press End, or when time is up; attempts still in progress are then submitted automatically by the API. Each session has its own results page: scores per student, by part and by question. Exam mode behaves like Quiz for now.
- **Test paper layout** (a second tab in the editor): school header, paper size, part titles, footer and a live print preview; optional separate answer sheet.
- **Code questions:** Python, Java, C, C++, JavaScript and PHP (optionally with tables and Laravel's DB facade, query builder and Eloquent). Visible and hidden test cases, graded by `apps/runner/` in a sandbox.
- **SQL questions:** students query your tables; their rows are compared with your answer query (column names ignored), with an optional hidden-data check. Graded with sql.js (SQLite) on the server.
- **Review answers:** grade essays, re-score blank and enumeration answers (accept a near-miss), see code and SQL test results, and watch a **typing replay** of code answers.
  Drawing answers show the picture full size with zoom, a replay of the strokes, and tools to draw marks over it; students see the marks on their result.
- **Anti-cheating** (per session). Rules: full screen with a set number of chances before it submits itself, a log of tab and app switches (Alt+Tab included) with how long each lasted, one screen only (Chrome and Edge), separate switches for right-click, copy, paste (with an exception for code answers), printing and clearing the clipboard at the start, and a watermark with the student's name. Prevention: one question at a time with an optional time per question, a join code, a late-join cutoff, a room password, an IP allowlist (CIDR or plain addresses) and one device per attempt, all enforced by the API along with the timer. Detection: disconnects (heartbeat), time away, out of full screen and offline, device and network changes, a shared-device flag, answers that come too fast, pasted or robot-typed answers with a typing replay for code, SQL, essays and blanks, open dev tools and split screen. The Anti-cheating page gives each student an integrity level (low, medium, high) with the signals behind it, per-type counts and times, a timeline and minutes away, and runs checks after the session: matching rare wrong answers, essay text similarity, timing clusters, and a **similarity check** for code (renamed copies still match; common solutions are ignored). Shared devices or networks are only flagged, since campus Wi-Fi shares addresses. Students never see this.
- **Live view** (`/teacher/assessments/<quiz>/sessions/<session>/live`): a table of every student (status, progress, current question, score so far, alerts, minutes away, integrity level) that updates as students answer, with each student's live answers, typing replay and event timeline in a drawer. Controls: start, pause and resume (every deadline moves by the time paused; nobody can save while paused), add time (everyone or one student), end, warn a student, lock and unlock a student (no saving until unlocked), force-submit, and allow back in (frees the attempt from its browser so a student whose computer crashed can continue on another). Every action is stored (`incidents` table) and shown in the timeline. Students see warnings, pauses, locks and new deadlines at once.
- **Class record** per class, laid out like the school's Excel class record: categories with weights (ADW 60 + major exam 40), highest possible scores, RS and transmuted grades (TRANSMU table), and the course grade with P/F/FA/DR remarks. Sessions of the class are **added automatically** and score as students submit; removing one keeps it out. Excel download.
- **Attendance:** meetings come from the class schedule; roll call on a phone (present, late, absent, excused). 7 lates count as 1 absence, and 4 absences flag a drop (the teacher confirms DR). Absences and an Attendance item fill in the class record. Excel download per month with weekday names, plus a semester summary.
- **Collegiate grade sheet** (printable) and the **Summary report on class academic performance** (Reports).

### Students
- Dashboard of what's open, upcoming and done; Schedule; Scores; Classes.
- **Standing:** the grade so far in each subject, computed like the class record, with absences used out of the limit.
- Taking a quiz or exam: full screen, a timer the server enforces, answers saved to the server as you type (reloads and other devices pick up where you left off), and **Run** for code (Python and JavaScript in the browser, the rest on the code runner) on the sample tests only.
- **Drawing and photo answers:** draw on a canvas (strokes are saved as you go, and the picture is uploaded when you submit and every 30 seconds while you draw), or upload or take photos. Pasting an image is blocked when the session blocks paste.

### Everyone
- Landing page at `/`. The login page lists the demo accounts while developing (set `SHOW_DEMO_ACCOUNTS=true` to show them in production).

## Run the app
The API needs PostgreSQL and the variables in `apps/rpc/.env.example` (copy it to `apps/rpc/.env`); the web app needs `apps/web/.env.example` (copy it to `apps/web/.env.local`).
```bash
pnpm install
pnpm db:migrate     # apply migrations
pnpm db:seed        # test accounts admin@, teacher@, student@sic.edu.ph (password 12341234) plus demo accounts (examora-demo)
pnpm dev:rpc        # http://127.0.0.1:3001 (RPC at /rpc)
pnpm dev:web        # http://localhost:3000
```

Or with [devenv](https://devenv.sh), which provides Node 22, the pinned pnpm and PostgreSQL 17:
```bash
devenv shell        # then run the commands above; every variable except the Google pair is set
devenv up           # or start Postgres, migrate, seed, and start the API and the web app in one step
```

Postgres listens on `127.0.0.1:5434` with an `examora` database: `postgresql://127.0.0.1:5434/examora`.

devenv generates `BETTER_AUTH_SECRET` once per machine and stores it in `.devenv/state/auth-secret` (gitignored); delete that file to rotate it, which signs everyone out. There is no self sign-up: admins create, edit, suspend and remove accounts at `/admin`. "Continue with Google" appears only when `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set, and works only for an existing account with the same email.

Accounts, quizzes, sessions, attempts, grades and the question bank live in Postgres behind the API, and survive restarts. Classes, rosters, class records and attendance still run on demo data in `apps/web/src/lib/data/mock.ts` and save in memory, so they're kept until the web server restarts; they move to the API later. `pnpm db:seed` loads the demo quizzes, sessions and submissions.

## Live sessions (WebSocket)
The browser can't send its login cookie to the API's host, so it never logs in to the WebSocket. The web server asks the API for a ticket (`live.ticket`, with the user's cookie): a signed (HMAC with `BETTER_AUTH_SECRET`), 60-second, single-use token for one teacher watching one session or one student following their own attempt. The browser opens `ws(s)://<API>/rpc/live` and sends the ticket with each request; every reconnect (with growing delays) gets a new ticket.
- `NEXT_PUBLIC_API_URL` in `apps/web/.env.local` (devenv sets it): the API as the **browser** reaches it, e.g. `http://localhost:3001` or `https://api.example.com` (the `ws://` / `wss://` URL is derived). It is read at build time. This is not the internal `API_URL`.
- Origin check: the API refuses a WebSocket upgrade from a browser whose `Origin` isn't the web app's: `LIVE_ALLOWED_ORIGINS` (comma separated, in `apps/rpc/.env`), by default the origin of `BETTER_AUTH_URL`. Requests without an Origin header aren't browsers and still need a valid ticket.
- The API must be reachable over WebSocket from browsers (a reverse proxy needs `Upgrade` headers and a long idle timeout).

## Run S3 storage (images and drawings)
Question images and students' drawings and photos are stored in an S3-compatible bucket (AWS S3, Cloudflare R2 or MinIO). `devenv up` starts MinIO on `127.0.0.1:9000` with an `examora` bucket and sets the variables below. Without them the API still starts, but uploads fail with "Image storage isn't set up" and images are not shown.

| Variable | Meaning |
|---|---|
| `S3_BUCKET` | Bucket name, e.g. `examora` (private) |
| `S3_REGION` | e.g. `us-east-1` (any value for MinIO) |
| `S3_ENDPOINT` | Empty for AWS S3; `http://127.0.0.1:9000` for MinIO; the account endpoint for R2 |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Credentials with read, write and delete on the bucket |
| `S3_PUBLIC_ENDPOINT` | Optional: the address browsers use to reach the bucket when it differs from `S3_ENDPOINT` |

Browsers upload straight to the bucket (presigned POST, type and 5 MB limit enforced by S3), so the bucket's CORS rules must allow `POST` from the web app's origin (MinIO allows any origin by default; on AWS S3 or R2 add a CORS rule with the web origin, method `POST` and `GET`, and any header). Without devenv, run MinIO yourself and create the bucket:
```bash
docker run -d -p 127.0.0.1:9000:9000 -e MINIO_ROOT_USER=examora -e MINIO_ROOT_PASSWORD=examora-secret minio/minio server /data
# then create the bucket "examora" (MinIO console, `mc mb`, or any S3 client)
```
A daily job in the API deletes uploads that were never confirmed and images that no question, answer or bank entry refers to, once they are more than a day old.

## Run the code runner (optional)
Code and SQL questions: the API grades SQL itself (sql.js in a worker thread); Python, Java, C, C++, JavaScript and PHP answers are run by `apps/runner/`, which needs Docker and which the API calls. (Students' Run button handles Python and JavaScript in the browser without it.)
```bash
npm run runner:sandbox   # once: builds the examora-sandbox image
cp apps/runner/.env.example apps/runner/.env   # set RUNNER_SECRET
npm run dev:runner       # http://127.0.0.1:4100
```
Set the same `RUNNER_SECRET` and `RUNNER_URL=http://127.0.0.1:4100` in `apps/rpc/.env`. Without the runner, code answers wait for the teacher to grade them.

## API
- `packages/contract`: RPC groups, schemas and errors shared by the web app and the API. Add a procedure here first.
- Quiz RPC groups (`packages/contract/src/quiz-rpc.ts`): `quiz.*` (quizzes, parts, questions, the question bank), `session.*` (create, update, start, end, release results, attempts, grade, class scores) and `attempt.*` (my sessions, the seeded paper, start, autosave, run sample tests, submit, integrity events, result, scores). Scoring and seeded shuffling are shared pure code in the contract (`scoring.ts`, `shuffle.ts`).
- Asset RPC group (`packages/contract/src/asset.ts`): `asset.createUpload` (presigned POST for one image, `question` images for teachers and `answer` images for students), `asset.confirm` (checks the file really is that image, records size and dimensions) and `asset.urls` (signed GET URLs only for assets the caller may see: their own, a quiz's images for its owner or for students on an open or ended session, students' answer images for the student and the session's teacher).
- Session lifecycle: a session is `scheduled` until its opening time (or until the teacher presses Start), `running`, then `ended` at its closing time or when the teacher ends it. A background job in the API runs every 30 seconds to open and end sessions and to submit attempts that ran past their time limit or the session's close (plus a 60-second grace). Answers are graded on submit: automatic scores in the API, code through the code runner (`RUNNER_URL`, `RUNNER_SECRET`), SQL through sql.js.
- Live sessions: `session.pause`, `resume`, `addTime`, `warn`, `setLocked`, `forceSubmit`, `allowBackIn` and `liveAttempt` (teacher actions), `live.ticket`, and the WebSocket group `LiveRpcs` (`packages/contract/src/live.ts`) at `/rpc/live` with the streams `live.teacher` (a snapshot, then changes) and `live.student` (pause, lock, deadline, warnings, "submitted"). The state is in Postgres (`quiz_sessions.paused_at`, `attempts.extra_ms` and `locked`, `incidents`), so a restarted API or a reconnecting browser shows the same thing; only the changes in flight live in memory (`Live.ts`, `LiveHub`), which is why one API server is enough for now.
- `apps/rpc/src`: Effect services (`Database`, `BetterAuth`, `Runner`, `Quizzes`, `LiveHub`, `Storage`, `Assets`), the auth middleware (`Session.ts`), RPC handlers (`handlers/`) and the server (`main.ts`). It runs on Node's built-in TypeScript support; no build step.
- `apps/web/src/lib/api/client.ts`: the RPC client. Server code calls `callApi((api) => api["admin.listUsers"](), forwardedHeaders(...))`.

Container: `apps/rpc/Dockerfile` (build from the repo root with `docker build -f apps/rpc/Dockerfile .`). It listens on `0.0.0.0:$PORT` (default 8080) and needs `DATABASE_URL`, `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` at runtime; it does not run migrations.

## Database
Schema: `apps/rpc/src/database/schemas/`. Migrations: `apps/rpc/src/database/migrations/`.
```bash
pnpm db:generate --name <change>   # after editing the schema; commit the generated SQL
pnpm db:migrate                    # apply pending migrations to DATABASE_URL
```

## CI
`.github/workflows/ci.yml` runs on pull requests and pushes to `main`: lint, typecheck, migration checks against a fresh PostgreSQL 17 (migrations apply, and the schema has no ungenerated changes), seed, an API start-up check, and the web build.

To migrate production on every push to `main`, add a `production` environment with a `DATABASE_URL` secret and set the repository variable `MIGRATE_ON_DEPLOY` to `true`.
