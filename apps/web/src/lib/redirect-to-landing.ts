export const LANDING_REDIRECT_MARKER = "playfit:redirected-to-landing";

export function redirectToMarketingLanding() {
  window.sessionStorage.setItem(LANDING_REDIRECT_MARKER, "1");
  void fetch("/api/auth/mark-returning", { method: "DELETE" });
  window.location.replace(`${window.location.origin}/`);
}
