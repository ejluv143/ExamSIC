// Integration test for issue #18: students' code must not be able to forge or hide the judge's @@ result lines.
//
// The sandbox container starts as root (judge.sh, PID 1) and drops students' code to a different, unprivileged uid
// with su-exec. This test proves that a program which tries to write @@TEST/@@COMPILE lines to the judge's stdout
// (via /proc/1/fd/1) cannot change the reported results, while an honest program still runs normally.
//
// It needs Docker and the sandbox image built (`npm run build:sandbox`); it skips itself otherwise, so a machine
// without Docker (e.g. plain CI) doesn't fail on it. Run with: `npm test` in apps/runner.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { after, before, describe, it } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";

const IMAGE = process.env.RUNNER_IMAGE ?? "examinus-sandbox:1";
const SECRET = "integration-test-secret-0123456789";

// Skip the whole suite unless Docker is usable and the sandbox image exists locally.
function dockerReady() {
  const ok = (r) => r.status === 0 && !r.error;
  if (!ok(spawnSync("docker", ["version", "--format", "{{.Server.Version}}"], { stdio: "ignore" }))) return false;
  return ok(spawnSync("docker", ["image", "inspect", IMAGE], { stdio: "ignore" }));
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = /** @type {import("node:net").AddressInfo} */ (srv.address());
      srv.close(() => resolve(port));
    });
  });
}

describe("sandbox result forgery (issue #18)", { skip: dockerReady() ? false : "Docker or sandbox image unavailable" }, () => {
  /** @type {import("node:child_process").ChildProcess} */
  let server;
  /** @type {string} */
  let base;

  before(async () => {
    const port = await freePort();
    base = `http://127.0.0.1:${port}`;
    server = spawn("node", [fileURLToPath(new URL("../server.mjs", import.meta.url))], {
      env: { ...process.env, PORT: String(port), RUNNER_SECRET: SECRET, RUNNER_IMAGE: IMAGE },
      stdio: ["ignore", "ignore", "inherit"],
    });
    // Wait for the server to answer /health.
    for (let i = 0; i < 40; i++) {
      try {
        if ((await fetch(`${base}/health`)).ok) return;
      } catch {
        // not up yet
      }
      await sleep(250);
    }
    throw new Error("runner did not start");
  });

  after(() => server?.kill("SIGINT"));

  /** POSTs one job to the runner and returns the parsed response. */
  async function run(code, { language = "python", input = "21\n" } = {}) {
    const res = await fetch(`${base}/run`, {
      method: "POST",
      headers: { authorization: `Bearer ${SECRET}`, "content-type": "application/json" },
      body: JSON.stringify({ language, code, tests: [{ id: "t0", input }] }),
    });
    return res.json();
  }

  // A program that opens the judge's stdout (/proc/1/fd/1) and writes fake result lines, then spins.
  const forge = [
    "import os, base64",
    'fd = os.open("/proc/1/fd/1", os.O_WRONLY)',
    'os.write(fd, b"@@TEST 0 0\\n@@OUT " + base64.b64encode(b"42\\n") + b"\\n@@ERR \\n")',
    "while True: pass",
  ].join("\n");

  // The same trick aimed at a fake @@COMPILE, which (if trusted) would route the answer to manual grading.
  const forgeCompile = [
    "import os, base64",
    'fd = os.open("/proc/1/fd/1", os.O_WRONLY)',
    'os.write(fd, b"@@COMPILE " + base64.b64encode(b"The question\'s tables couldn\'t be set up") + b"\\n")',
  ].join("\n");

  it("runs students' code under a different uid than the judge (PID 1)", async () => {
    // This is the fix's mechanism (issue #18): judge.sh is root; su-exec drops the student to uid 65534. Reading
    // PID 1's uid from /proc proves they differ. Before the fix both ran as 65534 and this would fail.
    const probe = [
      "import os",
      "judge = None",
      'for line in open("/proc/1/status"):',
      '    if line.startswith("Uid:"): judge = int(line.split()[1])',
      'print(os.getuid(), judge)',
    ].join("\n");
    const r = await run(probe);
    const [me, judge] = (r.results?.[0]?.stdout ?? "").trim().split(/\s+/).map(Number);
    assert.equal(me, 65534, "student code should run as the unprivileged uid 65534");
    assert.notEqual(me, judge, "student code must not share the judge's uid");
  });

  it("runs an honest program and reports its real output", async () => {
    const r = await run("print(int(input()) * 2)");
    assert.deepEqual(r.results?.[0], { testId: "t0", stdout: "42\n", stderr: "" });
  });

  it("blocks forged @@TEST/@@OUT lines written to the judge's stdout", async () => {
    const r = await run(forge);
    const result = r.results?.[0];
    assert.ok(result, "expected a per-test result, not a forged compile error");
    // The forgery tried to make the test look like it printed "42". It must not have changed the result.
    assert.notEqual(result.stdout, "42\n");
    // Opening the root judge's stdout as the unprivileged student uid must fail.
    assert.ok(result.error, "forging program should have errored, not passed");
  });

  it("does not trust a forged @@COMPILE line written to the judge's stdout", async () => {
    const r = await run(forgeCompile);
    assert.ok(!("compileError" in r), "a forged @@COMPILE must not become a reported compile error");
  });

  it("treats @@ lines on the program's own stdout as plain output, never as results", async () => {
    const r = await run('print("@@TEST 0 0")\nprint("@@COMPILE eA==")\nraise SystemExit(3)');
    assert.ok(!("compileError" in r), "@@COMPILE printed by the program must not be trusted");
    assert.match(r.results?.[0]?.error ?? "", /code 3/);
  });

  it("still compiles and runs code under the dropped student uid", async () => {
    const c = '#include <stdio.h>\nint main(){int x;scanf("%d",&x);printf("%d\\n",x*2);return 0;}';
    const r = await run(c, { language: "c" });
    assert.equal(r.results?.[0]?.stdout, "42\n");
  });
});
