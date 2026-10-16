// Checks Google Classroom roster sync end to end without Google: `npm run check:classroom` on a database with the test fixture
// loaded (`npm run test:fixture -w @examinus/rpc`).
// Starts a stand-in for Google's token and Classroom endpoints and its own API pointed at it (CLASSROOM_API_URL,
// GOOGLE_TOKEN_URL), links the test teacher's Google account with an expired access token, then calls
// `classroom.sync` as different users. Whatever it adds to the database is removed again at the end.
import { SQL } from "bun";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL isn't set.");
const sql = new SQL(databaseUrl);

const apiPort = Number(process.env.CHECK_API_PORT ?? 3199);
const api = `http://127.0.0.1:${apiPort}`;
const origin = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
const accountId = "check-classroom-google";
const newEmail = "check.classroom.new@student.example.com";

let failed = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `: ${JSON.stringify(detail)}`}`);
};

// jsonb read as text; values written through Drizzle on Bun SQL come back as a JSON string holding the JSON.
const parseJson = (text: string) => {
  const value: unknown = JSON.parse(text);
  return typeof value === "string" ? JSON.parse(value) : value;
};

// The fixture's test teacher and their first class linked to Classroom (at SIC, the organization the check works in).
const [teacher] = await sql`select id from users where email = 'teacher@sic.edu.ph' and role = 'user'`;
if (!teacher) throw new Error("No test teacher; load the test fixture first (`npm run test:fixture -w @examinus/rpc`).");
const linked = await sql`
  select id, classroom::text as classroom from classes
  where teacher_id = ${teacher.id} and organization_id = 'org-sic' and classroom is not null and archived_at is null order by id`;
if (linked.length < 2)
  throw new Error("The test teacher needs two classes linked to Classroom; load the test fixture (`npm run test:fixture -w @examinus/rpc`).");
const [cls, other] = linked;
const course = parseJson(cls.classroom) as { courseId: string };
const membersBefore: string[] = (await sql`select student_id from class_members where class_id = ${cls.id}`).map(
  (r: { student_id: string }) => r.student_id,
);
const [member] = await sql`
  select s.email from students s join class_members m on m.student_id = s.id where m.class_id = ${cls.id} limit 1`;
const [outsider] = await sql`
  select email from students s
  where not exists (select 1 from class_members m where m.student_id = s.id and m.class_id = ${cls.id}) limit 1`;
if (!member || !outsider) throw new Error("The fixture's students are missing; load the test fixture (`npm run test:fixture -w @examinus/rpc`).");

// Google: refreshes the token, then serves the course roster over two pages.
const googleCalls: string[] = [];
const google = Bun.serve({
  port: 0,
  hostname: "127.0.0.1",
  async fetch(req) {
    const url = new URL(req.url);
    googleCalls.push(`${req.method} ${url.pathname}${url.search}`);
    if (url.pathname === "/token") {
      const body = new URLSearchParams(await req.text());
      if (body.get("grant_type") !== "refresh_token" || body.get("refresh_token") !== "check-refresh")
        return new Response(null, { status: 400 });
      return Response.json({ access_token: "check-access", expires_in: 3600, token_type: "Bearer" });
    }
    if (req.headers.get("authorization") !== "Bearer check-access") return new Response(null, { status: 401 });
    if (url.pathname !== `/v1/courses/${course.courseId}/students`) return new Response(null, { status: 404 });
    if (url.searchParams.get("pageToken") === "2")
      return Response.json({
        students: [{ profile: { emailAddress: newEmail, name: { givenName: "Nina", familyName: "Newton" } } }],
      });
    return Response.json({
      students: [
        // Already on the roster; Classroom's email differs only in case.
        { profile: { emailAddress: member.email.toUpperCase(), name: { fullName: "Member" } } },
        // A known student who isn't in the class yet.
        { profile: { emailAddress: outsider.email, name: { fullName: "Outsider" } } },
        // No email: nothing to match, so skipped.
        { profile: { name: { fullName: "No Email" } } },
      ],
      nextPageToken: "2",
    });
  },
});

const server = Bun.spawn([process.execPath, "src/main.ts"], {
  cwd: `${import.meta.dir}/../..`,
  env: {
    ...process.env,
    PORT: String(apiPort),
    HOST: "127.0.0.1",
    GOOGLE_CLIENT_ID: "check-client",
    GOOGLE_CLIENT_SECRET: "check-secret",
    CLASSROOM_API_URL: `http://127.0.0.1:${google.port}/v1`,
    GOOGLE_TOKEN_URL: `http://127.0.0.1:${google.port}/token`,
  },
  stdout: "ignore",
  stderr: "inherit",
});

// One RPC call: the value on success, the error's tag otherwise.
const rpc = async (cookie: string, tag: string, payload: unknown) => {
  const res = await fetch(`${api}/rpc`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie, origin },
    body: JSON.stringify({ _tag: "Request", id: "1", tag, payload, headers: [] }),
  });
  const [{ exit }] = (await res.json()) as [
    { exit: { _tag: string; value?: unknown; cause?: { error?: { _tag: string } }[] } },
  ];
  return exit._tag === "Success" ? exit.value : exit.cause?.[0]?.error?._tag;
};

// Signs in and works at SIC (the test teacher also belongs to the second school, so their session must pick).
const signIn = async (email: string, password: string) => {
  const res = await fetch(`${api}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`Signing in as ${email} failed: ${res.status}`);
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  const switched = await rpc(cookie, "org.setActive", { organizationId: "org-sic" });
  if (typeof switched !== "object") throw new Error(`Switching ${email} to SIC failed: ${String(switched)}`);
  return cookie;
};

const sync = (cookie: string, classId: string) => rpc(cookie, "classroom.sync", { classId });

const otherClassroom = other.classroom;
try {
  let up = false;
  for (let i = 0; i < 60 && !up; i++) {
    up = await fetch(`${api}/health`).then(
      (r) => r.ok,
      () => false,
    );
    if (!up) await Bun.sleep(500);
  }
  if (!up) throw new Error(`The API didn't start on ${api}.`);

  await sql`
    insert into accounts (id, account_id, provider_id, user_id, access_token, refresh_token, access_token_expires_at, scope)
    values (${accountId}, 'check-google-user', 'google', ${teacher.id}, 'expired', 'check-refresh', now() - interval '1 hour',
      'openid email https://www.googleapis.com/auth/classroom.courses.readonly https://www.googleapis.com/auth/classroom.rosters.readonly https://www.googleapis.com/auth/classroom.profile.emails')`;

  const owner = await signIn("teacher@sic.edu.ph", "12341234");
  const total = membersBefore.length + 2;
  const first = await sync(owner, cls.id);
  check(
    "first sync adds the outsider and the new student",
    JSON.stringify(first) === JSON.stringify({ added: 2, total }),
    first,
  );
  const [created] =
    await sql`select first_name, last_name, student_number, user_id from students where email = ${newEmail}`;
  check(
    "the new student is created without a number or account",
    created?.first_name === "Nina" &&
      created?.last_name === "Newton" &&
      created?.student_number === null &&
      created?.user_id === null,
    created,
  );
  const [token] = await sql`select access_token from accounts where id = ${accountId}`;
  check("the expired access token is refreshed and stored", token?.access_token === "check-access", token);
  const [after] = await sql`select classroom::text as classroom from classes where id = ${cls.id}`;
  const lastSyncedAt = Date.parse((parseJson(after.classroom) as { lastSyncedAt: string }).lastSyncedAt);
  check("Last synced is now", Date.now() - lastSyncedAt < 60_000, after.classroom);
  check(
    "both roster pages are read",
    googleCalls.some((c) => c.includes("pageToken=2")),
    googleCalls,
  );

  const again = await sync(owner, cls.id);
  check("a second sync adds nobody", JSON.stringify(again) === JSON.stringify({ added: 0, total }), again);

  const refused = async (name: string, expected: string, result: Promise<unknown>) => {
    const got = await result;
    check(name, got === expected, got);
  };
  await refused(
    "another teacher can't sync the class",
    "NotFound",
    sync(await signIn("j.reyes@sic.edu.ph", "examinus-demo"), cls.id),
  );
  await refused("a student can't sync", "Forbidden", sync(await signIn("student@sic.edu.ph", "12341234"), cls.id));
  await refused("an unknown class is not found", "NotFound", sync(owner, "check-no-such-class"));
  // The second linked class's course doesn't exist in the stand-in; then the class is unlinked.
  await refused("a course Classroom doesn't know is reported", "ClassroomUnavailable", sync(owner, other.id));
  await sql`update classes set classroom = null where id = ${other.id}`;
  await refused("a class not linked to Classroom is refused", "Conflict", sync(owner, other.id));
} finally {
  server.kill();
  google.stop(true);
  await sql`update classes set classroom = (${otherClassroom}::text)::jsonb where id = ${other.id}`;
  await sql`update classes set classroom = (${cls.classroom}::text)::jsonb where id = ${cls.id}`;
  await sql`delete from class_members where class_id = ${cls.id} and student_id not in ${sql(membersBefore)}`;
  await sql`delete from students where email = ${newEmail}`;
  await sql`delete from accounts where id = ${accountId}`;
  await sql.close();
}

console.log(failed ? `\n${failed} check(s) failed.` : "\nClassroom sync works.");
process.exit(failed ? 1 : 0);
