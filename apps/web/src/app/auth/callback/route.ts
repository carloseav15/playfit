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
  const next = sanitizeNextPath(searchParams.get("next"));
  const redirectOrigin = getRedirectOrigin(request, origin);

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
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
