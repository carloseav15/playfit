export function redirectToMarketingLanding() {
  void fetch("/api/auth/mark-returning", { method: "DELETE" }).finally(() => {
    window.location.replace("/");
  });
}
