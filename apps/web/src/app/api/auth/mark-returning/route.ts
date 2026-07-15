import { jsonError } from "@/lib/api-errors";
import { clearReturningVisitor, markReturningVisitor } from "@/lib/returning-visitor";
import { createRequestSupabaseContext } from "@/lib/supabase/server";

// Email/password sign-in and sign-up happen entirely client-side (supabase-js direct
// calls), unlike Google OAuth (marked via /auth/callback's server redirect) and in-app
// profile saves (marked via /api/profile). Without this, a password-auth session never
// gets pf_returning set, so "/" keeps showing the cold-visitor marketing landing on every
// full navigation despite the user having a valid, authenticated session.
export async function POST(request: Request) {
  const context = await createRequestSupabaseContext(request);
  if (!context) return jsonError("Authentication required", 401);

  await markReturningVisitor();

  return Response.json({ ok: true });
}

export async function DELETE() {
  await clearReturningVisitor();
  return Response.json({ ok: true });
}
