import { NextResponse, type NextRequest } from "next/server";
import { Result } from "effect";
import { homeFor, roleNames } from "@examora/contract";
import { applyCookies, callApi, forwardedHeaders } from "@/lib/api/client";

// Sends people to the right page. The data layer still verifies every request and every permission.
export default async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const session = await callApi((api) => api["auth.session"](), forwardedHeaders(req.headers));
  const role = Result.isSuccess(session) ? session.success.user.role : null;

  // Each role has its own area: /admin, /teacher, /student.
  const area = roleNames.find((r) => pathname === `/${r}` || pathname.startsWith(`/${r}/`)) ?? null;

  let response: NextResponse;
  if (area && !role) {
    const login = new URL("/login", req.nextUrl);
    login.searchParams.set("next", pathname + search);
    response = NextResponse.redirect(login);
  } else if (area && role && role !== area) {
    response = NextResponse.redirect(new URL(homeFor(role), req.nextUrl));
  } else if (pathname === "/login" && role) {
    // Already signed in. /register stays open, so "Start free" always reaches it; signing up switches accounts.
    response = NextResponse.redirect(new URL(homeFor(role), req.nextUrl));
  } else {
    response = NextResponse.next();
  }
  // Better Auth extends active sessions; pass the refreshed cookie on to the browser.
  if (Result.isSuccess(session)) applyCookies(response.cookies, session.success.cookies);
  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/teacher/:path*", "/student/:path*", "/login", "/register"],
};
