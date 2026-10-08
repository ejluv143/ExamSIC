# Examinus (working name)

Quizzes and exams for colleges and universities: live quizzes like Wayground, plus timed, scheduled exams with essay grading.

## Decisions so far
- Audience: colleges and universities.
- Scale: up to 500 players in one live quiz, or 500 students taking one exam at the same time.
- Stack: Next.js + Tailwind (`apps/web/`); Effect 4 + PostgreSQL (Drizzle) API (`apps/rpc/`), called over typed Effect RPC defined in `packages/contract/`; code runner on Docker (`apps/runner/`). Redis and Socket.IO for live quizzes come later.
- Auth: [Better Auth](https://better-auth.com) in `apps/rpc/` (email/password, optional Google), stored in PostgreSQL through Drizzle. The web app signs in through RPC and sets the session cookies the API returns; it forwards `/api/auth/*` (the Google callback) to the API.
- Roles: admin, teacher and student, each with its own area (`/admin`, `/teacher`, `/student`). Permissions per role live in `packages/contract/src/permissions.ts`; the API checks them in its RPC handlers, Better Auth's admin plugin enforces account management, and the web app checks them with `requirePermission` for pages and mock data.
- Hosting: web on Vercel; the API needs a host that keeps WebSocket connections open (Fly.io / Railway / Render).
- Name: the product is **Examinus** (everything people see). Code, packages (`@examora/*`), the database, cookies and storage keys, and the sandbox image keep the old name `examora` on purpose, so nothing needs migrating.
- Rate limiting: in the API (`apps/rpc/src/RateLimiter.ts`), because Better Auth's own limiter skips the server-side calls the RPC handlers make. Per-IP limits are wide (a whole class can share one campus IP); per-account and per-student ones are tight. Counts live in memory per API process and move to Redis with live quizzes. Per-IP limits trust `x-forwarded-for`, which Vercel sets; a self-hosted web app needs a proxy that overwrites it.

## Features
Everything below works today. Accounts, classes and rosters are real (PostgreSQL); the rest runs on demo data in `apps/web/src/lib/data/` until it moves to the API.

### Teachers
- **Classes:** create a class and share its **class code**; students join with it. Edit or archive a class, make a new code, and remove students. Classes imported from Google Classroom show a link back to it.
- **Quizzes and exams.** A Subject dropdown decides the question types offered: General (multiple choice, identification, enumeration), English (+ fill in the blanks, true/false, essay), Mathematics (+ numeric), Science, and Programming / IT (+ code, SQL query). "Show all question types" lifts the limit. Questions come from the editor, the question bank, or an Excel import. Math is written in LaTeX.
- **Settings:** schedule and time limit, shuffling, results release, retakes (none, 1, 2, 3 or unlimited; the Try again button follows), and "Count in the class record".
- **Test paper layout** (a second tab in the editor): school header, paper size, part titles, footer and a live print preview; optional separate answer sheet.
- **Code questions:** Python, Java, C, C++, JavaScript and PHP (optionally with tables and Laravel's DB facade, query builder and Eloquent). Visible and hidden test cases, graded by `apps/runner/` in a sandbox.
- **SQL questions:** students query your tables; their rows are compared with your answer query (column names ignored), with an optional hidden-data check. Graded with sql.js (SQLite) on the server.
- **Review answers:** grade essays, re-score identification, fill in the blank and enumeration (accept a near-miss), see code and SQL test results, and watch a **typing replay** of code answers.
- **Anti-cheating** (per quiz or exam): full screen with a set number of chances before it submits itself, a log of tab and app switches (Alt+Tab included), one screen only (Chrome and Edge), blocked copy, paste, drag and printing, clipboard cleared at the start, a watermark with the student's name, and a server-side timer. The Anti-cheating page lists students with alerts and flags pasted or robot-typed code, and a **similarity check** compares code answers (renamed copies still match; common solutions are ignored).
- **Class record** per class, laid out like the school's Excel class record: categories with weights (ADW 60 + major exam 40), highest possible scores, RS and transmuted grades (TRANSMU table), and the course grade with P/F/FA/DR remarks. Published quizzes and exams are **added automatically** and score as students submit; removing one keeps it out. Excel download.
- **Attendance:** meetings come from the class schedule; roll call on a phone (present, late, absent, excused). 7 lates count as 1 absence, and 4 absences flag a drop (the teacher confirms DR). Absences and an Attendance item fill in the class record. Excel download per month with weekday names, plus a semester summary.
- **Collegiate grade sheet** (printable) and the **Summary report on class academic performance** (Reports).

### Students
- Dashboard of what's open, upcoming and done; Schedule; Scores; Classes, where they **join a class with its code** (the first time, also their student number and sex for the grade sheet) or leave one.
- **Standing:** the grade so far in each subject, computed like the class record, with absences used out of the limit.
- Taking an exam: full screen, timer, answers saved through reloads, and **Run** for code (Python and JavaScript in the browser, the rest on the code runner) on the sample tests only.

### Everyone
- **Sign up** at `/register` with Google or any email and start right away. Students give their student number the first time they join a class. `/register` opens even when signed in (every "Start free" button leads there); signing up switches to the new account.
- **Rate limits:** 10 wrong passwords per account in 15 minutes, 200 failed sign-ins per IP in 10 minutes, 100 sign-ups per IP an hour, 300 Google sign-in starts per IP in 10 minutes, and 10 wrong class codes per student in 10 minutes. The page says how long to wait.
- **Auto sign-out** (`apps/web/src/components/session-watch.tsx`): after 30 minutes without activity in any tab, with a "Still there?" warning a minute before (not while taking an exam). Open pages also go to sign-in when the session ends elsewhere (expired, signed out in another tab, suspended). The login page says why and returns them to where they were.
- Landing page at `/`.

## Run the app
The API needs PostgreSQL and the variables in `apps/rpc/.env.example` (copy it to `apps/rpc/.env`); the web app needs `apps/web/.env.example` (copy it to `apps/web/.env.local`).
```bash
pnpm install
pnpm db:migrate     # apply migrations
pnpm db:seed        # test accounts admin@, teacher@, student@sic.edu.ph (password 12341234) plus demo accounts (examora-demo)
pnpm dev:rpc        # http://127.0.0.1:3001 (RPC at /rpc)
pnpm plan:set teacher@sic.edu.ph pro 2026-12-31   # change a teacher's plan (free, pro or ai); no date = no end
pnpm dev:web        # http://localhost:3000
```

Or with [devenv](https://devenv.sh), which provides Node 22, the pinned pnpm and PostgreSQL 17:
```bash
devenv shell        # then run the commands above; every variable except the Google pair is set
devenv up           # or start Postgres, migrate, seed, and start the API and the web app in one step
```

Postgres listens on `127.0.0.1:5434` with an `examora` database: `postgresql://127.0.0.1:5434/examora`.

devenv generates `BETTER_AUTH_SECRET` once per machine and stores it in `.devenv/state/auth-secret` (gitignored); delete that file to rotate it, which signs everyone out. Students and teachers can sign up at `/register` with any email, Gmail included, and are signed in right away. Admins create, edit, suspend and remove accounts at `/admin`. Both pages show a Google button; it works once `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set (redirect URI `<BETTER_AUTH_URL>/api/auth/callback/google`). "Sign up with Google" on `/register` creates the account with the chosen role; "Continue with Google" on `/login` only signs in to an existing account with the same email.

Accounts, sessions, classes and rosters live in Postgres behind the API; the seed gives the test teacher the demo classes (codes `DBMS3AX`, `LOGIC1B`, `ELECT4A`) with the same ids as the demo data. Everything else still runs on demo data in `apps/web/src/lib/data/mock.ts`. Quizzes and exams, class records and attendance save into that demo data in memory, so they're kept until the web server restarts; grading in Review answers updates the page only. All of it moves to the API next.

## Run the code runner (optional)
Code and SQL questions: SQL is graded inside the web app; Python, Java, C, C++, JavaScript and PHP answers are run by `apps/runner/`, which needs Docker. (Students' Run button handles Python and JavaScript in the browser without it.)
```bash
npm run runner:sandbox   # once: builds the examora-sandbox image
cp apps/runner/.env.example apps/runner/.env   # set RUNNER_SECRET
npm run dev:runner       # http://127.0.0.1:4100
```
Set the same `RUNNER_SECRET` and `RUNNER_URL=http://127.0.0.1:4100` in `apps/web/.env.local`. Without the runner, code answers wait for the teacher to grade them.

## API
- `packages/contract`: RPC groups, schemas and errors shared by the web app and the API. Add a procedure here first.
- `apps/rpc/src`: Effect services (`Database`, `BetterAuth`), the auth middleware (`Session.ts`), RPC handlers (`handlers/`) and the server (`main.ts`). It runs on Node's built-in TypeScript support; no build step.
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
