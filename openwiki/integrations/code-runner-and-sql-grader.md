---
type: integration
title: Code runner and SQL grader
description: How code answers are run and graded — apps/runner's one-container-per-submission Docker sandbox and judge script, the API's Runner client with the shared limits and its null-means-teacher-grades rule, the browser's own Python and JavaScript sample runs — and how SQL answers are graded by sql.js in a killable child process with a cached sample result.
tags: [runner, docker, sandbox, code, sql, grading]
verified:
  - by: openwiki/0.7.1
    at: 2026-10-18T15:19:56.756Z
sources:
  - id: openwiki-source-40d22ad72f9a8713622ec657
    resource: repo://apps/rpc/src/features/attempt/Saving.ts
  - id: openwiki-source-3b0cff6f473e94546e112b49
    resource: repo://apps/rpc/src/platform/RateLimiter.ts
  - id: openwiki-source-f255d37ab77fb1d3586eedb7
    resource: repo://apps/rpc/src/platform/Runner.ts
  - id: openwiki-source-084429a6593667d9b69d1254
    resource: repo://apps/rpc/src/platform/sql-grader.ts
  - id: openwiki-source-8ecd95c9cc185f62e4f3bc3d
    resource: repo://apps/runner/sandbox/judge.sh
  - id: openwiki-source-2030d16e957abf749cebf9db
    resource: repo://apps/runner/server.mjs
  - id: openwiki-source-2e1515e53269dc0df69cb2be
    resource: repo://apps/web/src/components/question-kinds/run-js.ts
  - id: openwiki-source-2ac88b415c4a66773dc5fd41
    resource: repo://apps/web/src/components/question-kinds/run-python.ts
  - id: openwiki-source-b1d32f73878a27a60426d1e0
    resource: repo://packages/domain/src/kinds/code.ts
generated: { by: "omp", at: "2026-10-18T15:19:56.756Z" }
---

# Code runner and SQL grader

Code questions (Python, Java, C, C++, JavaScript, PHP) are graded by **`apps/runner`**, an optional Node service that the API calls; SQL questions are graded by the API itself with sql.js. Students' **Run** button runs Python and JavaScript in their own browser and everything else on the runner, against visible sample tests only; grading on submit always reruns on the server.

## The runner (`apps/runner/server.mjs`, `sandbox/`)

- **Start-up contract**: refuses to start without a `RUNNER_SECRET` of at least 16 characters or with a `RUNNER_CONCURRENCY` that isn't a whole number ≥ 1; listens on `127.0.0.1:$PORT` only. `POST /run` is authorised with a constant-time bearer comparison; bodies over 512 KiB are refused with 413, and the body is read as raw bytes and decoded once so multi-byte characters split across chunks survive.
- **Limits** mirror `packages/domain/kinds/code.ts#codeRunnerLimits` (30 tests, 64 KiB input, 256 KiB database, 20 000 characters of code, 512 KiB body); the API checks `codeRunnerProblem` before sending, so a job the runner would refuse never leaves the API. The two must be kept in step.
- **One throwaway container per submission** from the `examinus-sandbox` image (`npm run runner:sandbox` builds it): `--network none`, 512 MB memory with no swap, 1 CPU, a PID limit, read-only root, all capabilities dropped, and the student's code run as an unprivileged user by `judge.sh`; at most `RUNNER_CONCURRENCY` containers at once.
- **`judge.sh`** receives the tests' inputs as base64 lines on stdin, compiles if the language needs it (30 s SIGKILL limit) and runs each test under a per-language time limit — 1 s for C/C++, 2 s for Python and JavaScript, 3 s for PHP, 4 s for Java — reporting `@@COMPILE`, `@@TEST n exit`, `@@OUT`/`@@ERR` base64 lines with capped output. Exit code 137 is reported as "time limit exceeded or out of memory". PHP questions with tables get a fresh SQLite database seeded per test and Laravel's `DB` facade, query builder and Eloquent through `laravel.php`.

## The API side (`platform/Runner.ts`)

`Runner.runTests(question, code, tests)` returns the per-test results or **`null`**, which means "nothing could check it, the teacher grades it": when `RUNNER_URL`/`RUNNER_SECRET` are unset, the job is over the limits, the runner is unreachable (3-minute timeout) or refuses it, or the question's own tables fail to load. A student's compile error, by contrast, fails every test with the compiler's message. Each call is counted and timed in the metrics by language and outcome.

`attempt.runSampleTests` (the Run button for languages the browser can't run) runs only the non-hidden tests and is limited to 6 runs per student per minute (`limits.codeRun`). In a teacher-paced game, code and SQL answers are checked the same way while the room waits (see [Game mode](../modes/game-mode.md)).

## In the browser

`components/question-kinds/run-js.ts` runs JavaScript in a throwaway Web Worker (`public/runners/javascript.js`) that can't reach the network or storage; `run-python.ts` runs Python with Pyodide (CPython in WebAssembly, copied to `public/` by `scripts/copy-wasm.mjs`) in a worker. Both only see the sample tests the student can see.

## The SQL grader (`platform/sql-grader.ts`, `sql-grader-worker.ts`)

- Every grading runs sql.js in a **separate Bun child process** that is killed after 3 seconds, so a runaway query can't freeze the API. Each query gets a fresh database built from the question's `setupSql`.
- `runSqlChecks` compares the student's rows with the answer query's rows (column names ignored) on the sample data, and again on `hiddenDataSql` when the teacher wrote some, giving one `CodeTestResult` per check. A broken question (setup or answer query fails) returns `null`, so the teacher grades it by hand, like the code runner.
- `sampleResult` is what the answer query returns on the sample data; students see it as the expected result instead of the query. It is cached in Dragonfly for 24 hours under a hash of setup and answer SQL; a grader failure isn't cached.
