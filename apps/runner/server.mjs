// @ts-check
// Examinus code runner: runs students' programs in throwaway Docker containers and returns what they printed.
// The web app (later apps/rpc) calls POST /run with a shared secret; this service needs Docker access,
// so keep it on a private network and never expose it to students directly.
import { spawn } from "node:child_process";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";

const PORT = Number(process.env.PORT ?? 4100);
const SECRET = process.env.RUNNER_SECRET ?? "";
const IMAGE = process.env.RUNNER_IMAGE ?? "examora-sandbox:1";
// Containers running at once; more submissions wait their turn.
const CONCURRENCY = Number(process.env.RUNNER_CONCURRENCY ?? 2);

if (SECRET.length < 16) {
  console.error("Set RUNNER_SECRET (16+ characters) in apps/runner/.env. See .env.example.");
  process.exit(1);
}

/** Source file name per language. Java needs the class to be called Main. */
const sourceFile = { python: "main.py", javascript: "main.js", c: "main.c", cpp: "main.cpp", java: "Main.java", php: "main.php" };
const limits = {
  maxBody: 512 * 1024,
  maxCode: 20_000,
  maxTests: 30,
  maxInput: 64 * 1024,
  // Tables for PHP/Laravel questions: CREATE TABLE and INSERT statements.
  maxDatabase: 256 * 1024,
  // Per test, in seconds. Java starts slowly, so it gets more.
  timePerTest: { python: 2, javascript: 2, c: 1, cpp: 1, java: 4, php: 3 },
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

/** Runs the sandbox and resolves with its stdout (capped), or null if it had to be killed. */
function runContainer(/** @type {string} */ workDir, /** @type {string} */ language, /** @type {number} */ testCount) {
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
    IMAGE, language, String(perTest),
  ];
  // Whole-container limit: compiling plus every test, with slack for container start-up.
  const overallMs = (30 + testCount * (perTest + 1) + 10) * 1000;

  return new Promise((resolve) => {
    const child = spawn("docker", args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let killed = false;
    const kill = () => {
      killed = true;
      spawn("docker", ["rm", "-f", name], { stdio: "ignore" });
    };
    const timer = setTimeout(kill, overallMs);
    child.stdout.on("data", (chunk) => {
      out += chunk;
      if (out.length > limits.maxStdout) kill();
    });
    child.stderr.on("data", (chunk) => console.error(`[${name}]`, String(chunk).trim()));
    child.on("close", () => {
      clearTimeout(timer);
      resolve(killed ? null : out);
    });
  });
}

const decode = (/** @type {string | undefined} */ b64) => (b64 ? Buffer.from(b64, "base64").toString("utf8") : "");

/** Turns the sandbox's @@ lines into per-test results. */
function parse(/** @type {string} */ stdout) {
  const compile = stdout.match(/^@@COMPILE (.*)$/m);
  if (compile) return { compileError: decode(compile[1]) || "Compilation failed" };
  /** @type {Record<string, { exitCode: number, stdout: string, stderr: string }>} */
  const tests = {};
  let current = "";
  for (const line of stdout.split("\n")) {
    const [tag, ...rest] = line.split(" ");
    if (tag === "@@TEST") {
      current = rest[0];
      tests[current] = { exitCode: Number(rest[1]), stdout: "", stderr: "" };
    } else if (tag === "@@OUT" && tests[current]) tests[current].stdout = decode(rest[0]);
    else if (tag === "@@ERR" && tests[current]) tests[current].stderr = decode(rest[0]);
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

    const stdout = await withSlot(() => runContainer(workDir, job.language, job.tests.length));
    if (stdout === null) return { error: "The run took too long and was stopped." };
    const parsed = parse(stdout);
    if ("compileError" in parsed) return { compileError: parsed.compileError };
    const perTest = limits.timePerTest[/** @type {keyof typeof limits.timePerTest} */ (job.language)];
    return {
      results: job.tests.map((t, i) => {
        const r = parsed.tests[String(i)];
        if (!r) return { testId: t.id, stdout: "", error: "Didn't run" };
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

createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") return send(res, 200, { ok: true, image: IMAGE, running, waiting: waiting.length });
  if (req.method !== "POST" || req.url !== "/run") return send(res, 404, { error: "Not found" });
  if (!authorized(req.headers.authorization)) return send(res, 401, { error: "Unauthorized" });

  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > limits.maxBody) return send(res, 413, { error: "Too large" });
  }
  let job;
  try {
    job = JSON.parse(body);
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
