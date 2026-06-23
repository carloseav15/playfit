const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || null;

export function getSiteOrigin() {
  if (configuredSiteUrl) return configuredSiteUrl;
  if (typeof window !== "undefined") return window.location.origin;
  return "http://127.0.0.1:3000";
}

export function buildSiteUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${getSiteOrigin()}${normalizedPath}`;
}
