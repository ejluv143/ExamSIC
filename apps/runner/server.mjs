// @ts-check
// Examinus code runner: runs students' programs in throwaway Docker containers and returns what they printed.
// The web app (later apps/rpc) calls POST /run with a shared secret; this service needs Docker access,
// so keep it on a private network and never expose it to students directly.
import { spawn } from "node:child_process";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { chmod, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = Number(process.env.PORT ?? 4100);
const SECRET = process.env.RUNNER_SECRET ?? "";
const IMAGE = process.env.RUNNER_IMAGE ?? "examora-sandbox:1";
// Containers running at once; more submissions wait their turn. A whole number of at least 1: anything else
// (NaN, 0, "2.5", empty) would turn the queue's limit off.
const concurrencySetting = (process.env.RUNNER_CONCURRENCY ?? "2").trim();
const CONCURRENCY = /^\d+$/.test(concurrencySetting) ? Number(concurrencySetting) : 0;

if (SECRET.length < 16) {
  console.error("Set RUNNER_SECRET (16+ characters) in apps/runner/.env. See .env.example.");
  process.exit(1);
}
if (CONCURRENCY < 1) {
  console.error(
    `RUNNER_CONCURRENCY must be a whole number of at least 1 (got "${process.env.RUNNER_CONCURRENCY}"). See .env.example.`,
  );
  process.exit(1);
}

/** Source file name per language. Java needs the class to be called Main. */
const sourceFile = { python: "main.py", javascript: "main.js", c: "main.c", cpp: "main.cpp", java: "Main.java", php: "main.php" };
// The question editor keeps code questions within these (codeRunnerLimits in packages/contract/src/question.ts):
// keep the two in step.
const limits = {
  maxBody: 512 * 1024,
  maxCode: 20_000,
  maxTests: 30,
  maxInput: 64 * 1024,
  // Tables for PHP/Laravel questions: CREATE TABLE and INSERT statements.
  maxDatabase: 256 * 1024,
  // Per test, in seconds. Java starts slowly, so it gets more.
  timePerTest: { python: 2, javascript: 2, c: 1, cpp: 1, java: 4, php: 3 },
  // In seconds: judge.sh re-creates the tables before every test of a PHP question with tables.
  timeSeed: 10,
  maxStdout: 4 * 1024 * 1024,
};

// --- a small queue so only CONCURRENCY containers run at once ---
let running = 0;
/** @type {(() => void)[]} */
const waiting = [];
async function withSlot(/** @type {() => Promise<any>} */ job) {
  if (running >= CONCURRENCY) await new Promise((resolve) => waiting.push(() => resolve(undefined)));
  running++;
  try {
    return await job();
  } finally {
    running--;
    waiting.shift()?.();
  }
}

/** Runs a docker command and resolves with its exit code (-1 if docker couldn't be started) and stdout. */
function docker(/** @type {string[]} */ args) {
  /** @type {Promise<{ code: number, out: string }>} */
  const result = new Promise((resolve) => {
    const child = spawn("docker", args, { stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    child.stdout.on("data", (chunk) => (out += chunk));
    child.on("error", () => resolve({ code: -1, out }));
    child.on("close", (code) => resolve({ code: code ?? -1, out }));
  });
  return result;
}

// A run stopped before the daemon has created its container (slow daemon, image pull) leaves nothing to remove
// yet, but the daemon can still create it afterwards, so keep trying for a while. `docker rm -f` succeeds for a
// missing container too; it only prints the name when it removed one.
async function removeContainer(/** @type {string} */ name) {
  for (const waitMs of [0, 1000, 5000, 15000, 30000]) {
    await sleep(waitMs);
    if ((await docker(["rm", "-f", name])).out.trim()) return;
  }
}

/** Runs the sandbox and resolves with its stdout (capped) and whether it had to be killed part way. */
function runContainer(
  /** @type {string} */ workDir,
  /** @type {string} */ language,
  /** @type {number} */ testCount,
  /** @type {boolean} */ seeded,
) {
  const name = `examora-run-${randomUUID()}`;
  const perTest = limits.timePerTest[/** @type {keyof typeof limits.timePerTest} */ (language)];
  const args = [
    "run", "--rm", "--name", name,
    "--network", "none",
    "--memory", "512m", "--memory-swap", "512m",
    "--cpus", "1",
    "--pids-limit", "128",
    "--read-only",
    "--tmpfs", "/tmp:rw,exec,nosuid,size=64m",
    "--cap-drop", "ALL",
    "--security-opt", "no-new-privileges",
    "--ulimit", "nofile=256:256",
    "--user", "65534:65534",
    "-v", `${workDir}:/work:ro`,
    IMAGE, language, String(perTest), String(limits.timeSeed),
  ];
  // Whole-container limit: compiling plus every test (and its seeding), with slack for container start-up.
  const perTestTotal = perTest + 1 + (seeded ? limits.timeSeed + 1 : 0);
  const overallMs = (30 + testCount * perTestTotal + 10) * 1000;

  /** @type {Promise<{ out: string, killed: boolean }>} */
  const result = new Promise((resolve, reject) => {
    const child = spawn("docker", args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let killed = false;
    // Stop the docker CLI itself, so the slot frees even when there's no container yet, then the container.
    const kill = () => {
      if (killed) return;
      killed = true;
      child.kill("SIGKILL");
      void removeContainer(name);
    };
    const timer = setTimeout(kill, overallMs);
    child.stdout.on("data", (chunk) => {
      out += chunk;
      if (out.length > limits.maxStdout) kill();
    });
    child.stderr.on("data", (chunk) => console.error(`[${name}]`, String(chunk).trim()));
    // docker couldn't be started (not on PATH, or EMFILE/EAGAIN under load). Without this listener Node would throw
    // and take the whole runner down; instead this run fails with a 500, and the API leaves the answer to the teacher.
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(new Error(`Couldn't start docker: ${error.message}`, { cause: error }));
    });
    child.on("close", () => {
      clearTimeout(timer);
      resolve({ out, killed });
    });
  });
  return result;
}

const decode = (/** @type {string | undefined} */ b64) => (b64 ? Buffer.from(b64, "base64").toString("utf8") : "");

// Turns the sandbox's @@ lines into per-test results. Only finished lines count, and a test only once its @@ERR
// line (its last) is in, so a container killed part way still gives the tests it finished.
function parse(/** @type {string} */ stdout) {
  const lines = stdout.slice(0, stdout.lastIndexOf("\n") + 1).split("\n");
  const compile = lines.find((line) => line.startsWith("@@COMPILE "));
  if (compile) return { compileError: decode(compile.slice("@@COMPILE ".length)) || "Compilation failed" };
  /** @type {Record<string, { exitCode: number, stdout: string, stderr: string }>} */
  const tests = {};
  /** @type {{ n: string, exitCode: number, stdout: string } | null} */
  let current = null;
  for (const line of lines) {
    const [tag, ...rest] = line.split(" ");
    if (tag === "@@TEST") current = { n: rest[0], exitCode: Number(rest[1]), stdout: "" };
    else if (tag === "@@OUT" && current) current.stdout = decode(rest[0]);
    else if (tag === "@@ERR" && current) {
      tests[current.n] = { exitCode: current.exitCode, stdout: current.stdout, stderr: decode(rest[0]) };
      current = null;
    }
  }
  return { tests };
}

async function run(/** @type {{ language: string, code: string, tests: { id: string, input: string }[], database?: string }} */ job) {
  const workDir = await mkdtemp(path.join(tmpdir(), "examora-run-"));
  try {
    await mkdir(path.join(workDir, "tests"));
    await writeFile(path.join(workDir, sourceFile[/** @type {keyof typeof sourceFile} */ (job.language)]), job.code);
    await Promise.all(job.tests.map((t, i) => writeFile(path.join(workDir, "tests", `${i}.in`), t.input)));
    if (job.database) await writeFile(path.join(workDir, "database.sql"), job.database);
    // The sandbox user (nobody) must be able to read it all.
    await chmod(workDir, 0o755);
    await chmod(path.join(workDir, "tests"), 0o755);

    const { out, killed } = await withSlot(() => runContainer(workDir, job.language, job.tests.length, Boolean(job.database)));
    const tooLong = "The run took too long and was stopped.";
    const parsed = parse(out);
    if ("compileError" in parsed) return { compileError: parsed.compileError };
    // Stopped before any test finished (a slow compile, say): nothing to keep.
    if (killed && Object.keys(parsed.tests).length === 0) return { error: tooLong };
    const perTest = limits.timePerTest[/** @type {keyof typeof limits.timePerTest} */ (job.language)];
    return {
      results: job.tests.map((t, i) => {
        const r = parsed.tests[String(i)];
        // Tests that finished before the run was stopped keep their results; the rest are marked.
        if (!r) return { testId: t.id, stdout: "", error: killed ? tooLong : "Didn't run" };
        const error =
          r.exitCode === 137
            ? `Time limit exceeded (${perTest} s) or out of memory`
            : r.exitCode !== 0
              ? `Exited with code ${r.exitCode}${r.stderr ? `\n${r.stderr.trim()}` : ""}`
              : undefined;
        return { testId: t.id, stdout: r.stdout, stderr: r.stderr, error };
      }),
    };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

/** @returns {string | null} a reason the job is invalid */
function invalid(/** @type {any} */ job) {
  if (!job || typeof job !== "object") return "Send JSON.";
  if (!Object.hasOwn(sourceFile, job.language)) return "Unknown language.";
  if (typeof job.code !== "string" || job.code.length > limits.maxCode) return "Code missing or too long.";
  if (job.database !== undefined && (typeof job.database !== "string" || job.database.length > limits.maxDatabase))
    return "Database setup must be a string under 256 KB.";
  if (!Array.isArray(job.tests) || job.tests.length === 0 || job.tests.length > limits.maxTests) return "1–30 tests.";
  for (const t of job.tests)
    if (typeof t?.id !== "string" || typeof t?.input !== "string" || t.input.length > limits.maxInput)
      return "Each test needs an id and an input string.";
  return null;
}

function authorized(/** @type {string | undefined} */ header) {
  const given = Buffer.from(header?.replace(/^Bearer /, "") ?? "");
  const expected = Buffer.from(SECRET);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

const send = (/** @type {import("node:http").ServerResponse} */ res, /** @type {number} */ status, /** @type {unknown} */ body) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};

// After a crash, containers and temp directories from the last run are left behind. This assumes one runner per
// Docker daemon and temp directory.
async function removeLeftovers() {
  const { code, out } = await docker(["ps", "-a", "--filter", "name=examora-run-", "--format", "{{.Names}}"]);
  const names = out.split("\n").filter((n) => n.startsWith("examora-run-"));
  if (code !== 0) console.error("Couldn't list leftover containers: is Docker running?");
  else if (names.length) {
    await docker(["rm", "-f", ...names]);
    console.log(`Removed ${names.length} leftover container(s).`);
  }
  const dirs = (await readdir(tmpdir())).filter((d) => d.startsWith("examora-run-"));
  await Promise.all(dirs.map((d) => rm(path.join(tmpdir(), d), { recursive: true, force: true })));
  if (dirs.length) console.log(`Removed ${dirs.length} leftover temp director${dirs.length === 1 ? "y" : "ies"}.`);
}
await removeLeftovers();

createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") return send(res, 200, { ok: true, image: IMAGE, running, waiting: waiting.length });
  if (req.method !== "POST" || req.url !== "/run") return send(res, 404, { error: "Not found" });
  if (!authorized(req.headers.authorization)) return send(res, 401, { error: "Unauthorized" });

  // Keep the raw bytes and decode once at the end: decoding chunk by chunk would break a multi-byte character
  // (ñ, é, emoji) that falls across a chunk boundary.
  /** @type {Buffer[]} */
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    chunks.push(chunk);
    size += chunk.length;
    if (size > limits.maxBody) return send(res, 413, { error: "Too large" });
  }
  let job;
  try {
    job = JSON.parse(Buffer.concat(chunks, size).toString("utf8"));
  } catch {
    return send(res, 400, { error: "Send JSON." });
  }
  const problem = invalid(job);
  if (problem) return send(res, 400, { error: problem });

  try {
    send(res, 200, await run(job));
  } catch (e) {
    console.error(e);
    send(res, 500, { error: "The runner failed." });
  }
}).listen(PORT, "127.0.0.1", () => console.log(`Examinus runner on http://127.0.0.1:${PORT} (image ${IMAGE}, ${CONCURRENCY} at a time)`));
