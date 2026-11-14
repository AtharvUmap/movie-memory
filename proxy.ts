import { NextResponse, type NextRequest } from "next/server";

// Optimistic check only: "is there a session cookie at all?". It gives
// signed-out visitors a real HTTP 307 before the page renders. It does NOT
// prove the session is valid; the pages verify it against the DB
// (getCurrentUser) and are the real security boundary.
const SESSION_COOKIES = [
  "authjs.session-token", // http://localhost
  "__Secure-authjs.session-token", // https
];

export function proxy(request: NextRequest) {
  const hasSessionCookie = SESSION_COOKIES.some((name) =>
    request.cookies.has(name),
  );
  if (!hasSessionCookie) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/onboarding/:path*"],
};
