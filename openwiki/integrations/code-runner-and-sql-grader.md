---
type: integration
title: Code runner and SQL grader
description: How code answers are executed — the apps/runner Docker sandbox service and its /run protocol, the API's Runner client, the sql.js SQL grader in a killable child process, the in-browser Run button for Python, JavaScript and SQL, and what happens when the runner is missing.
tags: [code-runner, docker, sandbox, sql, grading, pyodide]
sources:
  - id: openwiki-source-224e2f79ce2d864ccf06441f
    resource: repo://apps/rpc/src/handlers/AttemptHandlers.ts
  - id: openwiki-source-e9c107c75b992a0b5c9fffa3
    resource: repo://apps/rpc/src/Runner.ts
  - id: openwiki-source-48f049327d0978cd3246d4fb
    resource: repo://apps/rpc/src/sql-grader-worker.ts
  - id: openwiki-source-a116279326497272d45bc01d
    resource: repo://apps/rpc/src/sql-grader.ts
  - id: openwiki-source-8ecd95c9cc185f62e4f3bc3d
    resource: repo://apps/runner/sandbox/judge.sh
  - id: openwiki-source-a965b5285ce18589b2e5a0a9
    resource: repo://apps/runner/sandbox/laravel.php
  - id: openwiki-source-2030d16e957abf749cebf9db
    resource: repo://apps/runner/server.mjs
  - id: openwiki-source-0270aee636abb560f2e92aaf
    resource: repo://apps/web/src/lib/run-js.ts
  - id: openwiki-source-96739a302169fb88641264b3
    resource: repo://apps/web/src/lib/run-python.ts
  - id: openwiki-source-c7fd7054fd7b185e3e4575ac
    resource: repo://packages/contract/src/question.ts
generated: { by: "omp", at: "2026-10-09T18:11:05.062Z" }
verified:
  - by: openwiki/0.7.1
    at: 2026-10-09T18:11:05.062Z
---

# Code runner and SQL grader

Three execution paths exist, with different trust levels:

| Path | Where | Used for | Trusted for grades? |
|---|---|---|---|
| `apps/runner` + Docker sandbox | Separate Node service | Grading code answers (all six languages) on submit; `attempt.runSampleTests` for languages the browser can't run | Yes |
| SQL grader (`sql-grader.ts`) | Inside the API, child process | Grading SQL answers; expected sample output for students | Yes |
| Browser (`run-python.ts`, `run-js.ts`, `run-sql.ts`) | Student's browser | Run button on **visible** sample tests, previews | No — grading always reruns on the server with hidden tests |

## Runner service (`apps/runner`)

A dependency-free Node 22 HTTP server (`server.mjs`), started with `npm run dev:runner` (`node --env-file=.env --watch`). It needs Docker access, so it listens on `127.0.0.1` only and must stay on a private network.

**Config** (`apps/runner/.env`): `RUNNER_SECRET` (required, ≥16 chars, else exit), `PORT` (4100), `RUNNER_CONCURRENCY` (2 containers at once; others queue; must be a whole number ≥ 1 or the runner exits, since anything else would switch the queue limit off), `RUNNER_IMAGE` (`examora-sandbox:1`, built by `npm run runner:sandbox`).

**Protocol:**

- `GET /health` → `{ ok, image, running, waiting }`.
- `POST /run` with `Authorization: Bearer <RUNNER_SECRET>` (compared with `timingSafeEqual`) and JSON `{ language, code, tests: [{ id, input }], database? }`. Limits: body 512 KB (bytes), code 20 000 chars, 1–30 tests, 64 KB input per test, PHP `database` ≤ 256 KB. The body is collected as raw bytes and decoded once, so multi-byte characters split across chunks (ñ, é, emoji) survive.

The same limits live in the contract as `codeRunnerLimits` (`packages/contract/src/question.ts`), with `codeRunnerJob` (the request body; only PHP sends `database`) and `codeRunnerProblem` (the runner's refusal checks). `server.mjs` and the contract must be kept in step by hand.
- Reply: `{ results: [{ testId, stdout, stderr, error? }] }`, `{ compileError }`, or `{ error }` (e.g. "The run took too long and was stopped.").

**Per submission:** writes the source (`main.py`, `Main.java`, …) and `tests/<n>.in` to a temp dir, then `docker run --rm` with:

`--network none`, 512 MB memory (no swap), 1 CPU, `--pids-limit 128`, `--read-only` root, 64 MB `/tmp` tmpfs, `--cap-drop ALL`, `no-new-privileges`, `nofile=256`, user `65534`, work dir mounted read-only.

The whole container is killed after `30 + tests × (perTest + 1) + 10` seconds or if stdout exceeds 4 MB. Per-test limits: python/javascript 2 s, c/cpp 1 s, php 3 s, java 4 s. Exit code 137 is reported as "Time limit exceeded or out of memory".

**Sandbox image** (`sandbox/Dockerfile`, Alpine 3.20): python3, gcc/g++, OpenJDK 21, Node, PHP 8.3 with SQLite, and Laravel's `illuminate/database` installed at build time (no network at run time). `judge.sh` (PID 1, as `nobody`):

- compiles C (`-std=c17`), C++ (`-std=c++17`) or Java with a 30 s limit, emitting `@@COMPILE <base64>` on failure;
- runs each test under `timeout -s KILL`, then `kill -9 -1` to remove leftover children;
- prints `@@TEST <n> <exit>`, `@@OUT <base64>` (64 KB cap), `@@ERR <base64>` (4 KB cap), which `server.mjs#parse` turns into results;
- JavaScript runs through `prelude.js`, which provides `readline()`, `input` and `print` like the browser Run button;
- PHP questions with tables get a fresh SQLite database **per test** from `seed.php`, and `laravel.php` is auto-prepended to give the `DB` facade and Eloquent.

## API side: `Runner` service (`apps/rpc/src/Runner.ts`)

`Runner.configured` is true only when both `RUNNER_URL` and `RUNNER_SECRET` are set in `apps/rpc/.env`. `runTests(question, code, tests?)`:

- returns **`null`** (= "not checked", the teacher grades it like an essay) when unconfigured; when `codeRunnerProblem` says the job is over the runner's limits (logged as a warning, not sent); when the call fails or the runner answers non-2xx (its `{ error }` reason is logged); or when the compile error says *the question's tables* couldn't be created (the teacher's fault, not the student's);
- marks every test failed with the reason when the student's program didn't compile or the whole run was stopped;
- otherwise compares each test's stdout with `expectedOutput` via the contract's `outputMatches` (whitespace-normalised).

Calls time out after 180 s because submissions queue on the runner. `Quizzes.submit` checks up to 3 questions concurrently. See [Grading](../workflows/grading-and-results.md).

`attempt.runSampleTests` runs only non-hidden tests, requires a writable attempt, caps code at 20 000 chars and allows **6 runs per student per minute** (in-memory per API process). It returns `null` when the runner isn't available.

## SQL grader (`apps/rpc/src/sql-grader.ts`)

SQL answers never touch the runner. For each check, the API spawns `sql-grader-worker.ts` as a **separate Bun process** (not a worker thread, because Bun can't terminate a worker stuck inside WebAssembly) and kills it after 3 s. The README's "worker thread" wording is outdated.

- The worker builds a fresh in-memory sql.js database from `setupSql` (+ `hiddenDataSql` for the hidden check) **for every query**, so one query can't affect the next; `zeroblob`/`randomblob` are disabled; rows are capped at `maxRows`.
- Checks: `sample`, plus `hidden` when the teacher wrote hidden data. Each compares the student's rows with `answerSql`'s using `sameResult` (column names ignored; `orderMatters` per question).
- `checkQuery` (contract `sql.ts`) rejects anything but one `SELECT`/`WITH … SELECT` up front.
- A broken question (setup or answer query fails) returns `null` → teacher grades it. A timeout fails the remaining checks immediately.
- `sampleResult` caches the answer query's output per `(setupSql, answerSql)` for showing students the expected table.

## Browser Run button (`apps/web/src/lib`)

- **Python** (`run-python.ts`): Pyodide in a long-lived Web Worker (first load ~13 MB, 60 s limit), 3 s per run, network APIs removed after load.
- **JavaScript** (`run-js.ts`): throwaway Web Worker per run, 2 s limit, network/storage globals removed, same `readline`/`print` API as the sandbox prelude.
- **SQL** (`run-sql.ts`): sql.js's own worker from `/sqljs/`, 3 s limit, fresh database per job.
- Other languages call `attempt.runSampleTests` through the API.

The WebAssembly files are copied into `apps/web/public/` by `scripts/copy-wasm.mjs` before `dev` and `build`.

## Operating notes

- Without the runner, code answers are submitted as `needs_grading` and wait for the teacher; nothing fails.
- `apps/web/.env.example` and `apps/runner/.env.example` still describe the web app as the runner's caller; the actual caller is the API.
- The question editor refuses to save code questions whose tests the runner would turn down (see [Quizzes and questions](../concepts/quizzes-and-questions.md#editor-web)), so over-limit jobs should only come from older quizzes.
- The runner, rate limits for sample runs and the SQL sample cache are all per process.
