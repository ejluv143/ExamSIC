# Examora (working name)

Quizzes and exams for colleges and universities: live quizzes like Wayground, plus timed, scheduled exams with essay grading.

## Decisions so far
- Audience: colleges and universities.
- Scale: up to 500 players in one live quiz, or 500 students taking one exam at the same time.
- Stack: Next.js + Tailwind (`apps/web/`); Effect 4 + PostgreSQL (Drizzle) API (`apps/rpc/`), called over typed Effect RPC defined in `packages/contract/`; code runner on Docker (`apps/runner/`). Redis and Socket.IO for live quizzes come later.
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
- **Parts.** You create, rename, reorder and delete parts, each with markdown instructions, and move questions between them (drag, or "Move to part" and up/down on a phone). A part can shuffle its questions or draw N of its M questions for each student (a pool). The printed paper uses your parts, with points per part ("Part II – Matching (10 pts)").
- **Points.** Every question has points (whole or half, default 1) and, per question, "all or nothing" or "partial credit". Points are shared equally among a question's blanks, pairs, items or tests, or you can set a weight for each. Essay rubric rows carry points that add up to the question's points. Each part and the whole quiz show live totals; bulk-set the points of a whole part or of one question type; every question in a pool needs the same points. A game-points setting (Standard, Double, None) is stored for the game mode and only shown under Advanced. Automatic scores are stored as a fraction and manual scores in points, so changing a question's points recalculates everyone's score.
- **Randomizing.** Shuffling is seeded from each attempt, so a student's paper is the same after a reload and the teacher sees exactly what they saw. The quiz can shuffle the order of parts, the questions within parts, multiple-choice choices, the matching right column and the cloze dropdowns and word bank; pools draw N questions per student. The answer key and scoring are never affected by the order.
- **Sessions.** "Start a session" on a quiz picks a class and its students, the mode (Quiz or Exam), schedule, time limit, results release, retakes (none, 1, 2, 3 or unlimited; the Try again button follows), anti-cheating rules and "Count in the class record". A session is scheduled until it opens (or you press Start), runs, and ends at its close time, when you press End, or when time is up; attempts still in progress are then submitted automatically by the API. Each session has its own results page: scores per student, by part and by question. Exam mode behaves like Quiz for now.
- **Test paper layout** (a second tab in the editor): school header, paper size, part titles, footer and a live print preview; optional separate answer sheet.
- **Code questions:** Python, Java, C, C++, JavaScript and PHP (optionally with tables and Laravel's DB facade, query builder and Eloquent). Visible and hidden test cases, graded by `apps/runner/` in a sandbox.
- **SQL questions:** students query your tables; their rows are compared with your answer query (column names ignored), with an optional hidden-data check. Graded with sql.js (SQLite) on the server.
- **Review answers:** grade essays, re-score blank and enumeration answers (accept a near-miss), see code and SQL test results, and watch a **typing replay** of code answers.
- **Anti-cheating** (per session). Rules: full screen with a set number of chances before it submits itself, a log of tab and app switches (Alt+Tab included) with how long each lasted, one screen only (Chrome and Edge), separate switches for right-click, copy, paste (with an exception for code answers), printing and clearing the clipboard at the start, and a watermark with the student's name. Prevention: one question at a time with an optional time per question, a join code, a late-join cutoff, a room password, an IP allowlist (CIDR or plain addresses) and one device per attempt, all enforced by the API along with the timer. Detection: disconnects (heartbeat), time away, out of full screen and offline, device and network changes, a shared-device flag, answers that come too fast, pasted or robot-typed answers with a typing replay for code, SQL, essays and blanks, open dev tools and split screen. The Anti-cheating page gives each student an integrity level (low, medium, high) with the signals behind it, per-type counts and times, a timeline and minutes away, and runs checks after the session: matching rare wrong answers, essay text similarity, timing clusters, and a **similarity check** for code (renamed copies still match; common solutions are ignored). Shared devices or networks are only flagged, since campus Wi-Fi shares addresses. Students never see this.
- **Class record** per class, laid out like the school's Excel class record: categories with weights (ADW 60 + major exam 40), highest possible scores, RS and transmuted grades (TRANSMU table), and the course grade with P/F/FA/DR remarks. Sessions of the class are **added automatically** and score as students submit; removing one keeps it out. Excel download.
- **Attendance:** meetings come from the class schedule; roll call on a phone (present, late, absent, excused). 7 lates count as 1 absence, and 4 absences flag a drop (the teacher confirms DR). Absences and an Attendance item fill in the class record. Excel download per month with weekday names, plus a semester summary.
- **Collegiate grade sheet** (printable) and the **Summary report on class academic performance** (Reports).

### Students
- Dashboard of what's open, upcoming and done; Schedule; Scores; Classes.
- **Standing:** the grade so far in each subject, computed like the class record, with absences used out of the limit.
- Taking a quiz or exam: full screen, a timer the server enforces, answers saved to the server as you type (reloads and other devices pick up where you left off), and **Run** for code (Python and JavaScript in the browser, the rest on the code runner) on the sample tests only.

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
- Session lifecycle: a session is `scheduled` until its opening time (or until the teacher presses Start), `running`, then `ended` at its closing time or when the teacher ends it. A background job in the API runs every 30 seconds to open and end sessions and to submit attempts that ran past their time limit or the session's close (plus a 60-second grace). Answers are graded on submit: automatic scores in the API, code through the code runner (`RUNNER_URL`, `RUNNER_SECRET`), SQL through sql.js.
- `apps/rpc/src`: Effect services (`Database`, `BetterAuth`, `Runner`, `Quizzes`), the auth middleware (`Session.ts`), RPC handlers (`handlers/`) and the server (`main.ts`). It runs on Node's built-in TypeScript support; no build step.
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
