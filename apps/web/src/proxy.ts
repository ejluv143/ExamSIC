import { NextResponse, type NextRequest } from "next/server";
import { decrypt, SESSION_COOKIE } from "@/lib/auth/session";

// Quick cookie-only check to send people to the right page. The data layer still verifies every request.
export default async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const session = await decrypt(req.cookies.get(SESSION_COOKIE)?.value);

  const area = pathname.startsWith("/teacher") ? "teacher" : pathname.startsWith("/student") ? "student" : null;
  const home = session && (session.role === "teacher" ? "/teacher" : "/student");

  if (area && !session) {
    const login = new URL("/login", req.nextUrl);
    login.searchParams.set("next", pathname + search);
    return NextResponse.redirect(login);
  }
  // Students can't open teacher pages and vice versa.
  if (area && session && session.role !== area) {
    return NextResponse.redirect(new URL(home!, req.nextUrl));
  }
  if (pathname === "/login" && home) {
    return NextResponse.redirect(new URL(home, req.nextUrl));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/teacher/:path*", "/student/:path*", "/login"],
};
