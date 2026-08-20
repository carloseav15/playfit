import { NextResponse } from "next/server";
import { RETURNING_VISITOR_COOKIE } from "@/lib/returning-visitor";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function getRedirectOrigin(request: Request, origin: string) {
  if (process.env.NODE_ENV === "development") return origin;

  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (configuredSiteUrl) return configuredSiteUrl;

  const forwardedHost = request.headers.get("x-forwarded-host");
  if (forwardedHost) return `https://${forwardedHost}`;

  return origin;
}

function sanitizeNextPath(rawNext: string | null) {
  if (!rawNext) return "/";
  // Only allow same-origin relative paths: must start with a single "/" and
  // never "//" or "/\" (both can be interpreted as protocol-relative URLs by
  // browsers, which would redirect off-origin).
  if (!rawNext.startsWith("/") || rawNext.startsWith("//") || rawNext.startsWith("/\\")) {
    return "/";
  }
  return rawNext;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);

  const code = searchParams.get("code");
  const rawNext = searchParams.get("next");
  const redirectOrigin = getRedirectOrigin(request, origin);

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // A brand-new user (Google or email) has no games_library.profiles row yet -- that's
      // expected, profile creation is lazy and only happens once onboarding is saved. But
      // landing on "/" with no profile makes DecisionShell treat this as a stale/broken
      // session and bounce back to the marketing page (clearing this very cookie), which
      // strands a first-time signer-in in a silent redirect loop. Route them straight into
      // onboarding instead, unless the caller already asked for a specific destination.
      let next = sanitizeNextPath(rawNext);
      if (!rawNext) {
        const userId = data?.session?.user.id ?? data?.user?.id;
        if (userId) {
          const { data: profile } = await supabase.rpc("get_profile", { p_user_id: userId });
          if (!profile) next = "/?onboarding=1";
        }
      }
      const response = NextResponse.redirect(`${redirectOrigin}${next}`);
      response.cookies.set(RETURNING_VISITOR_COOKIE, "1", {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
      });
      return response;
    }
  }

  return NextResponse.redirect(`${redirectOrigin}/?error=auth_failed`);
}
