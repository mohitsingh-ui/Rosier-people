import { NextResponse, type NextRequest } from "next/server";

// Cheap gate: bounce requests without a session cookie to /login.
// Real session validation + authorization happens server-side on every page, action and API route.
const PUBLIC = ["/login", "/forgot-password", "/reset-password", "/api/auth", "/api/files", "/api/health"];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname.startsWith(p))) return NextResponse.next();
  if (!req.cookies.get("rp_session")) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + req.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|brand/).*)"] };
