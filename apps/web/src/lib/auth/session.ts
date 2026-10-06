import "server-only";
import { jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";

// Signed (not encrypted) cookie holding only who is signed in. Real accounts will come from apps/api.
export type Session = { userId: string; role: "teacher" };

export const SESSION_COOKIE = "examora_session";
const maxAgeDays = 7;

function secretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set. Add it to apps/web/.env.local (see .env.example).");
  return new TextEncoder().encode(secret);
}

export async function encrypt(session: Session) {
  return new SignJWT(session)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${maxAgeDays}d`)
    .sign(secretKey());
}

export async function decrypt(token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    if (typeof payload.userId !== "string" || payload.role !== "teacher") return null;
    return { userId: payload.userId, role: payload.role };
  } catch {
    return null;
  }
}

export async function createSession(session: Session) {
  (await cookies()).set(SESSION_COOKIE, await encrypt(session), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeDays * 24 * 60 * 60,
  });
}

export async function deleteSession() {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function readSession() {
  return decrypt((await cookies()).get(SESSION_COOKIE)?.value);
}
