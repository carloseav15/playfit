import { cookies } from "next/headers";

export const RETURNING_VISITOR_COOKIE = "pf_returning";

export async function isReturningVisitor() {
  const cookieStore = await cookies();
  return cookieStore.get(RETURNING_VISITOR_COOKIE)?.value === "1";
}

// Best-effort: this cookie only smooths out repeat visits to the marketing landing page.
// It must never take down the actual caller (profile save/delete, auth) on a request
// context that doesn't support writing cookies (or in tests, where next/headers isn't mocked).
export async function markReturningVisitor() {
  try {
    const cookieStore = await cookies();
    cookieStore.set(RETURNING_VISITOR_COOKIE, "1", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  } catch {
    // no-op
  }
}

export async function clearReturningVisitor() {
  try {
    const cookieStore = await cookies();
    // `.delete(name)` only clears a cookie whose path matches the default ("/" here, since
    // that's what markReturningVisitor sets) — passing the same options explicitly avoids
    // relying on that default matching by coincidence.
    cookieStore.delete({ name: RETURNING_VISITOR_COOKIE, path: "/" });
  } catch {
    // no-op
  }
}
