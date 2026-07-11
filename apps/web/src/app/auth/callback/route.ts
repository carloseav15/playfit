import { NextResponse } from "next/server";
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
  console.log("Supabase Auth Callback URL:", request.url);
  const { searchParams, origin } = new URL(request.url);

  if (searchParams.get("error") || searchParams.get("error_description")) {
    console.error("Auth Callback error from provider:", {
      error: searchParams.get("error"),
      description: searchParams.get("error_description"),
    });
  }

  const code = searchParams.get("code");
  const next = sanitizeNextPath(searchParams.get("next"));
  const redirectOrigin = getRedirectOrigin(request, origin);

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${redirectOrigin}${next}`);
    } else {
      console.error("Supabase Auth Code Exchange Error:", error.message, error);
    }
  } else {
    console.error("Supabase Auth Callback: No code provided in query params");
  }

  return NextResponse.redirect(`${redirectOrigin}/?error=auth_failed`);
}
