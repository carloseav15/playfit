import { captureFocusSnapshot, escapeHtml, restoreFocusSnapshot } from "../ui/helpers";
import { NAV_ICONS } from "../ui/render";
import type { AppContext, ProductTab } from "./context";

export function renderShell(ctx: AppContext) {
  const focusSnapshot = captureFocusSnapshot(ctx.root);
  const isOnboarded = !!ctx.state.user.onboardingCompletedAt;
  const shouldAnimate = ctx.ui.isTabSwitch;
  ctx.ui.isTabSwitch = false;
  const availableTabs: ProductTab[] = [
    "today",
    "library",
    "finder",
    "upcoming",
    "profile",
    "onboarding",
  ];
  const tabLabel: Record<ProductTab, string> = {
    onboarding: "Setup",
    today: "Today",
    finder: "Search",
    library: "My Games",
    profile: "Profile",
    upcoming: "Upcoming",
  };

  const mainContent =
    ctx.ui.activeTab === "onboarding"
      ? `<section class="product-onboarding-shell">${renderOnboarding(ctx)}</section>`
      : ctx.ui.activeTab === "today"
        ? renderToday(ctx)
        : ctx.ui.activeTab === "library"
          ? renderLibrary(ctx)
          : ctx.ui.activeTab === "profile"
            ? renderProfile(ctx)
            : ctx.ui.activeTab === "upcoming"
              ? renderUpcoming(ctx)
              : renderFinder(ctx);

  const dossierOverlay = ctx.ui.dossierGameId
    ? `<div class="product-modal-layer" data-action="close-dossier-overlay">${renderDossierScreen(ctx, ctx.ui.dossierGameId)}</div>`
    : "";

  const navItems = availableTabs
    .map(
      (tab) => `
    <button class="app-nav-item${ctx.ui.activeTab === tab ? " is-active" : ""}" data-action="switch-tab" data-tab="${tab}"${ctx.ui.activeTab === tab ? ' aria-current="page"' : ""}>
      ${NAV_ICONS[tab]}
      <span>${tabLabel[tab]}</span>
    </button>
  `,
    )
    .join("");

  const bottomNavItems = availableTabs
    .map(
      (tab) => `
    <button class="app-bottom-nav-item${ctx.ui.activeTab === tab ? " is-active" : ""}" data-action="switch-tab" data-tab="${tab}"${ctx.ui.activeTab === tab ? ' aria-current="page"' : ""}>
      ${NAV_ICONS[tab]}
      <span>${tabLabel[tab]}</span>
    </button>
  `,
    )
    .join("");

  ctx.root.innerHTML = `
    <div class="app-shell">
      <aside class="app-sidebar">
        <div class="app-brand">
          <span class="app-brand-eyebrow">Playfit</span>
          <strong class="app-brand-name">Find your next game</strong>
        </div>
        <nav class="app-nav" aria-label="Main navigation">
          ${navItems}
        </nav>
        <div class="app-sidebar-footer">
          ${!isOnboarded ? `<p class="app-sidebar-tagline">Tell us what you like, get picks that fit.</p>` : ""}
        </div>
      </aside>

      <div class="app-main">
        <header class="app-topbar">
          <div class="app-brand">
            <span class="app-brand-eyebrow">Playfit</span>
            <strong class="app-brand-name">Find your next game</strong>
          </div>
        </header>

        <main class="app-content${shouldAnimate ? " app-content-animate" : ""}">
          ${mainContent}
        </main>

        <nav class="app-bottom-nav" aria-label="Main navigation">
          ${bottomNavItems}
        </nav>
      </div>
    </div>
    ${dossierOverlay}
    ${ctx.ui.statusMessage ? `<div class="product-toast" role="status">${escapeHtml(ctx.ui.statusMessage)}</div>` : ""}
  `;

  restoreFocusSnapshot(ctx.root, focusSnapshot);
}

import { renderDossierScreen } from "./dossier";
import { renderFinder } from "./finder";
import { renderLibrary } from "./library";
import { renderOnboarding } from "./onboarding";
import { renderProfile } from "./profile";
import { renderToday } from "./today";
import { renderUpcoming } from "./upcoming";
