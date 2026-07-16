export const LANDING_REDIRECT_MARKER = "playfit:redirected-to-landing";

let redirectPending = false;

export function redirectToMarketingLanding() {
  if (redirectPending) return;
  redirectPending = true;
  window.sessionStorage.setItem(LANDING_REDIRECT_MARKER, "1");
  void fetch("/api/auth/mark-returning", { method: "DELETE" }).finally(() => {
    window.location.replace(`${window.location.origin}/`);
  });
}
