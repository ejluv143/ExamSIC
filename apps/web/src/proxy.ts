import { NextResponse, type NextRequest } from "next/server";
import { decrypt, SESSION_COOKIE } from "@/lib/auth/session";

// Quick cookie-only check to send people to the right page. The data layer still verifies every request.
export default async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const session = await decrypt(req.cookies.get(SESSION_COOKIE)?.value);

  if (pathname.startsWith("/teacher") && !session) {
    const login = new URL("/login", req.nextUrl);
    login.searchParams.set("next", pathname + search);
    return NextResponse.redirect(login);
  }
  if (pathname === "/login" && session) {
    return NextResponse.redirect(new URL("/teacher", req.nextUrl));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/teacher/:path*", "/login"],
};
