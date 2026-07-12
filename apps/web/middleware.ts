import { type NextRequest, NextResponse } from "next/server";

// Server Components can't read the current pathname directly — this stamps every request
// with it via a header so (play)/layout.tsx can tell "/" apart from every other route under
// the same layout (needed to scope the cold-visitor landing-page gate to "/" only).
export function middleware(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set("x-pathname", request.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
};
