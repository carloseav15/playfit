"use client";

import { CalendarDays, Library, Radar, Search, Settings2, Sparkles } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { ComponentType } from "react";
import { useEffect } from "react";
import { Container } from "@/components/ui/container";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { StatusDot } from "@/components/ui/status-dot";
import { cn } from "@/lib/utils";
import { FinderSection } from "./finder-section";
import { LibrarySection } from "./library-section";
import { OnboardingSection } from "./onboarding-section";
import { type ProductTab, usePlayfit } from "./playfit-context";
import { ProfileSection } from "./profile-section";
import { StatusToast } from "./status-toast";
import { TodaySection } from "./today-section";
import { UpcomingSection } from "./upcoming-section";

const tabItems: Array<{
  tab: ProductTab;
  label: string;
  icon: ComponentType<{ className?: string }>;
}> = [
  { tab: "today", label: "Today", icon: CalendarDays },
  { tab: "library", label: "My Games", icon: Library },
  { tab: "finder", label: "Discover", icon: Search },
  { tab: "upcoming", label: "Upcoming", icon: Radar },
  { tab: "profile", label: "Profile", icon: Settings2 },
  { tab: "onboarding", label: "Setup", icon: Sparkles },
];

function NavButton({
  tab,
  label,
  icon: Icon,
}: {
  tab: ProductTab;
  label: string;
  icon: ComponentType<{ className?: string }>;
}) {
  const { ui, setUi } = usePlayfit();
  const active = ui.activeTab === tab;

  return (
    <button
      type="button"
      className={cn(
        "flex min-h-11 cursor-pointer items-center gap-2 rounded-xl px-3 text-left text-sm font-bold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active &&
          "border border-[color-mix(in_srgb,var(--accent),transparent_62%)] bg-[color-mix(in_srgb,var(--accent),transparent_88%)] text-foreground",
      )}
      aria-current={active ? "page" : undefined}
      onClick={() =>
        setUi((current) => ({
          ...current,
          activeTab: tab,
          profileMode: "overview",
        }))
      }
    >
      <Icon className="size-4" />
      <span>{label}</span>
    </button>
  );
}

function SaveIndicator() {
  const { ui } = usePlayfit();
  const status = ui.saveStatus;
  const label = status === "saving" ? "Saving" : status === "saved" ? "Saved" : "Not saved";

  if (status === "idle") return null;

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary px-2 py-1 text-[11px] font-bold text-muted-foreground">
      <StatusDot
        tone={status === "saved" ? "positive" : status === "error" ? "negative" : "warning"}
        animate={status === "saving"}
      />
      {label}
    </span>
  );
}

function MobileNavButton({
  tab,
  label,
  icon: Icon,
}: {
  tab: ProductTab;
  label: string;
  icon: ComponentType<{ className?: string }>;
}) {
  const { ui, setUi } = usePlayfit();
  const active = ui.activeTab === tab;
  return (
    <button
      type="button"
      className={cn(
        "grid cursor-pointer place-items-center gap-1 rounded-md p-2 text-[0.68rem] font-bold text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active && "bg-secondary text-foreground",
      )}
      aria-current={active ? "page" : undefined}
      onClick={() => setUi((current) => ({ ...current, activeTab: tab, profileMode: "overview" }))}
    >
      <Icon className="size-4" />
      {label}
    </button>
  );
}

function ActiveSection() {
  const { state, ui, setUi } = usePlayfit();
  const { activeTab } = ui;
  const onboardingCompleted = state.user.onboardingCompletedAt;

  useEffect(() => {
    if (activeTab === "onboarding" && onboardingCompleted) {
      setUi((current) => ({
        ...current,
        activeTab: "today",
        profileMode: "overview",
      }));
    }
  }, [activeTab, onboardingCompleted, setUi]);

  if (activeTab === "onboarding") {
    if (onboardingCompleted) return null;
    return <OnboardingSection />;
  }
  if (activeTab === "library") return <LibrarySection />;
  if (activeTab === "finder") return <FinderSection />;
  if (activeTab === "profile") return <ProfileSection />;
  if (activeTab === "upcoming") return <UpcomingSection />;
  return <TodaySection />;
}

function ProductShell() {
  const { state, ui } = usePlayfit();
  const showSetup = !state.user.onboardingCompletedAt;
  const visibleTabs = tabItems.filter((t) => showSetup || t.tab !== "onboarding");

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_right,rgba(94,128,255,0.09),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.02),transparent_30%)] text-foreground">
      <div className="grid min-h-screen md:grid-cols-[260px_1fr]">
        <aside className="sticky top-0 hidden h-screen border-r border-border bg-card/78 p-6 backdrop-blur-xl md:grid md:grid-rows-[auto_1fr_auto]">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <svg
                viewBox="0 0 24 24"
                className="size-5 shrink-0 text-accent"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                aria-hidden="true"
              >
                <path d="M12 2L22 12L12 22L2 12L12 2Z" />
              </svg>
              <strong className="font-display text-xl">Playfit</strong>
            </div>
            <SaveIndicator />
          </div>
          <p className="mt-4 max-w-xs text-sm leading-6 text-muted-foreground">
            A decision system for what to play next, with memory and reasons attached.
          </p>
          <nav className="mt-8 grid content-start gap-2" aria-label="Main navigation">
            {visibleTabs.map((item) => (
              <NavButton key={item.tab} {...item} />
            ))}
          </nav>
          <p className="text-sm text-muted-foreground">
            Decision surfaces, not backlog management.
          </p>
        </aside>

        <div className="min-w-0 pb-20 md:pb-0">
          <header className="border-b border-border bg-background/88 p-4 backdrop-blur-xl md:hidden">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <svg
                  viewBox="0 0 24 24"
                  className="size-5 shrink-0 text-accent"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  aria-hidden="true"
                >
                  <path d="M12 2L22 12L12 22L2 12L12 2Z" />
                </svg>
                <strong className="font-display text-xl">Playfit</strong>
              </div>
              <SaveIndicator />
            </div>
          </header>
          <Container as="main" size="lg" className="grid gap-6 py-6 md:py-8">
            <AnimatePresence mode="wait">
              <motion.div
                key={ui.activeTab}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
              >
                <ErrorBoundary>
                  <ActiveSection />
                </ErrorBoundary>
              </motion.div>
            </AnimatePresence>
          </Container>
          <nav
            className={`fixed inset-x-0 bottom-0 z-40 grid border-t border-border bg-background/96 p-2 backdrop-blur-xl md:hidden ${showSetup ? "grid-cols-6" : "grid-cols-5"}`}
            aria-label="Main navigation"
          >
            {visibleTabs.map(({ tab, label, icon: Icon }) => (
              <MobileNavButton key={tab} tab={tab} label={label} icon={Icon} />
            ))}
          </nav>
        </div>
      </div>
      <StatusToast />
    </div>
  );
}

export function ProductApp() {
  return <ProductShell />;
}
