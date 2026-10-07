import { NextResponse, type NextRequest } from "next/server";
import { homeFor, isRole, roleNames } from "@/lib/auth/roles";
import { auth } from "@/lib/auth/server";

// Sends people to the right page. The data layer still verifies every request and every permission.
export default async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const session = await auth.api.getSession({ headers: req.headers });
  const role = session && isRole(session.user.role) ? session.user.role : null;

  // Each role has its own area: /admin, /teacher, /student.
  const area = roleNames.find((r) => pathname === `/${r}` || pathname.startsWith(`/${r}/`)) ?? null;

  if (area && !role) {
    const login = new URL("/login", req.nextUrl);
    login.searchParams.set("next", pathname + search);
    return NextResponse.redirect(login);
  }
  if (area && role && role !== area) {
    return NextResponse.redirect(new URL(homeFor(role), req.nextUrl));
  }
  if (pathname === "/login" && role) {
    return NextResponse.redirect(new URL(homeFor(role), req.nextUrl));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/teacher/:path*", "/student/:path*", "/login"],
};
