import { normalizeProfileSignals } from "../domain/onboarding";
import { createEmptyState, escapeHtml } from "../ui/helpers";
import { renderProfileEditor, renderStatusBadge } from "../ui/render";
import type { AppContext } from "./context";

export function renderProfile(ctx: AppContext) {
  const rawProfile = ctx.state.user.profile;

  if (!rawProfile) {
    return createEmptyState(
      "Finish setup first to see your taste profile.",
      "Open setup",
      "go-setup",
    );
  }

  const profile = normalizeProfileSignals(rawProfile);
  const positiveSignals = profile.signals.filter((signal) => signal.tone === "positive");
  const negativeSignals = profile.signals.filter((signal) => signal.tone === "negative");

  const allRated = Object.values(ctx.state.user.gameStates).filter((gs) => gs.rating != null);
  const likedCount = allRated.filter((gs) => gs.rating! >= 4).length;
  const mixedCount = allRated.filter((gs) => gs.rating! >= 2.5 && gs.rating! < 4).length;
  const dislikedCount = allRated.filter((gs) => gs.rating! < 2.5).length;
  const totalRated = likedCount + mixedCount + dislikedCount;
  const hitRate = totalRated > 0 ? Math.round((likedCount / totalRated) * 100) : 0;

  const playingCount = Object.values(ctx.state.user.gameStates).filter(
    (gs) => gs.status === "playing",
  ).length;
  const backlogCount = Object.values(ctx.state.user.gameStates).filter((gs) => gs.inBacklog).length;
  const wishlistCount = Object.values(ctx.state.user.gameStates).filter(
    (gs) => gs.inWishlist,
  ).length;
  const confidenceLabel =
    totalRated >= 8 ? "Clear picture" : totalRated >= 4 ? "Good read" : "Still learning";

  if (ctx.ui.profileMode === "edit") {
    return `
      <section class="product-page-stack product-profile-edit-screen">
        <button class="product-button product-button-ghost product-back-button" data-action="close-profile-edit">← Back to Profile</button>
        <section class="product-card product-profile-overview">
          <div class="product-page-header">
            <p class="product-eyebrow">Edit your taste</p>
            <h2>What matters to you</h2>
            <p class="product-tagline">Adjust your preferences. Your recommendations update right away.</p>
          </div>
        </section>
        ${renderProfileEditor(profile)}
        <section class="product-card product-recalibrate">
          <div class="product-recalibrate-body">
            <div>
              <strong>Recalculate your profile</strong>
              <p class="product-note">Rebuild from your setup answers, ratings, and play history.</p>
            </div>
            <button class="product-button product-button-secondary" data-action="recalibrate-profile">Refresh profile</button>
          </div>
        </section>
      </section>
    `;
  }

  return `
    <section class="product-page-stack">
      <section class="product-card product-profile-overview">
        <div class="product-page-header product-page-header-row">
          <div>
            <p class="product-eyebrow">Your taste</p>
            <h2>Your profile</h2>
            <p class="product-tagline">${escapeHtml(profile.summary)}</p>
            <p class="product-note">Based on your setup and ${totalRated} rated game${totalRated !== 1 ? "s" : ""}.</p>
            <p class="product-note">${ctx.state.user.onboardingCompletedAt ? "Picks improve as you add more ratings." : "Complete setup to get your first picks."}</p>
          </div>
          <button class="product-button product-button-primary" data-action="open-profile-edit">Edit preferences</button>
        </div>
        <div class="product-profile-signal-grid">
          <article class="product-signal-panel">
            <span class="product-eyebrow">What you like</span>
            <div class="product-chip-list">
              ${positiveSignals.length > 0 ? positiveSignals.map((signal) => renderStatusBadge(signal.label, "positive")).join("") : renderStatusBadge("More rated games needed", "neutral")}
            </div>
          </article>
          <article class="product-signal-panel">
            <span class="product-eyebrow">What breaks fit</span>
            <div class="product-chip-list">
              ${negativeSignals.length > 0 ? negativeSignals.map((signal) => renderStatusBadge(signal.label, "negative")).join("") : renderStatusBadge("No major pattern yet", "neutral")}
            </div>
          </article>
          <article class="product-signal-panel">
            <span class="product-eyebrow">How certain I am</span>
            <strong>${escapeHtml(confidenceLabel)}</strong>
            <p class="product-note">${totalRated} rated game${totalRated === 1 ? "" : "s"} behind these picks.</p>
            ${renderStatusBadge(profile.watchVsPlayRisk === "high" ? "Some may read better than played" : "Playable picks prioritized", profile.watchVsPlayRisk === "high" ? "warning" : "positive")}
          </article>
        </div>
      </section>

      <section class="product-card product-track-record">
        <div class="product-page-header">
          <p class="product-eyebrow">Stats</p>
          <h2>Your history</h2>
        </div>
        <div class="product-track-record-grid">
          <div class="product-stat-card">
            <span class="product-stat-value">${totalRated}</span>
            <span class="product-stat-label">Rated</span>
          </div>
          <div class="product-stat-card">
            <span class="product-stat-value">${hitRate}%</span>
            <span class="product-stat-label">Loved it</span>
          </div>
          <div class="product-stat-card">
            <span class="product-stat-value">${playingCount}</span>
            <span class="product-stat-label">Playing</span>
          </div>
          <div class="product-stat-card">
            <span class="product-stat-value">${backlogCount}</span>
            <span class="product-stat-label">Backlog</span>
          </div>
          <div class="product-stat-card">
            <span class="product-stat-value">${wishlistCount}</span>
            <span class="product-stat-label">Wishlist</span>
          </div>
        </div>
      </section>

      <section class="product-card product-recalibrate">
        <div class="product-recalibrate-body">
          <div>
            <strong>Export your data</strong>
            <p class="product-note">Download a backup of your profile and game states.</p>
          </div>
          <button class="product-button product-button-ghost" data-action="export-data">Export JSON</button>
        </div>
      </section>
    </section>
  `;
}
