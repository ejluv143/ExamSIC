import { NextResponse, type NextRequest } from "next/server";
import { Result } from "effect";
import { homeFor, roleNames, roleOf } from "@examinus/domain/roles";
import { applyCookies, callApi, forwardedHeaders } from "@/lib/api/client";
import { pageSecurityHeaders } from "@/lib/security-headers";

// Gives every page its security headers, and sends people to the right page. The data layer still verifies
// every request and every permission.
export default async function proxy(req: NextRequest) {
  // A fresh nonce per page. The renderer reads it from the request's CSP header and puts it on its inline scripts.
  const headers = pageSecurityHeaders(btoa(crypto.randomUUID()));
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("content-security-policy", headers["Content-Security-Policy"]);

  const response = await route(req, requestHeaders);
  for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
  return response;
}

async function route(req: NextRequest, requestHeaders: Headers) {
  const { pathname, search } = req.nextUrl;
  // Each role has its own area: /admin, /teacher, /student. /organizations is open to every signed-in account.
  const area = roleNames.find((r) => pathname === `/${r}` || pathname.startsWith(`/${r}/`)) ?? null;
  const picker = pathname === "/organizations" || pathname.startsWith("/organizations/");
  // Only these pages depend on who is signed in; the rest skip the session lookup.
  if (!area && !picker && pathname !== "/login" && pathname !== "/register") {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  const session = await callApi((api) => api["auth.session"](), forwardedHeaders(req.headers));
  const user = Result.isSuccess(session) ? session.success.user : null;
  const role = user ? roleOf(user) : null;

  let response: NextResponse;
  if ((area || picker) && !user) {
    const login = new URL("/login", req.nextUrl);
    login.searchParams.set("next", pathname + search);
    response = NextResponse.redirect(login);
  } else if (area && user && role !== area) {
    // Also a user without an active organization (role null): the picker is their home.
    response = NextResponse.redirect(new URL(homeFor(role), req.nextUrl));
  } else if (pathname === "/login" && user) {
    // Already signed in. /register stays open, so "Start free" always reaches it; signing up switches accounts.
    response = NextResponse.redirect(new URL(homeFor(role), req.nextUrl));
  } else {
    response = NextResponse.next({ request: { headers: requestHeaders } });
  }
  // Better Auth extends active sessions; pass the refreshed cookie on to the browser.
  if (Result.isSuccess(session)) applyCookies(response.cookies, session.success.cookies);
  return response;
}

export const config = {
  // Every page. Not the API forwards, built assets, or files from public/ (anything with an extension).
  matcher: ["/((?!api/|_next/|assets/|__vinext/|.*\\.[^/]+$).*)"],
};
