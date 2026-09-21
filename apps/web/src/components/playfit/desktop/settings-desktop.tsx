import { Gamepad2, Palette, ShieldAlert, User } from "lucide-react";
import Link from "next/link";
import type { ComponentType } from "react";
import { cn } from "@/lib/utils";
import { PlatformsTabContent } from "../platforms-tab-content";

export const SETTINGS_SECTIONS = ["platforms", "account", "appearance", "privacy"] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

export function parseSettingsSection(value: string | undefined): SettingsSection {
  return SETTINGS_SECTIONS.find((section) => section === value) ?? "platforms";
}

const sectionItems: {
  section: SettingsSection;
  label: string;
  Icon: ComponentType<{ className?: string }>;
}[] = [
  { section: "platforms", label: "Your platforms", Icon: Gamepad2 },
  { section: "account", label: "Account", Icon: User },
  { section: "appearance", label: "Appearance", Icon: Palette },
  { section: "privacy", label: "Data & privacy", Icon: ShieldAlert },
];

interface SettingsDesktopProps {
  section: SettingsSection;
  accountLabel: string;
  summaries: Record<SettingsSection, string>;
  renderPrivacyCard: () => React.ReactNode;
  renderThemeCard: () => React.ReactNode;
  renderAccountCard: () => React.ReactNode;
}

export function SettingsDesktop({
  section,
  accountLabel,
  summaries,
  renderThemeCard,
  renderAccountCard,
  renderPrivacyCard,
}: SettingsDesktopProps) {
  return (
    <div className="hidden gap-8 md:grid md:grid-cols-[15rem_minmax(0,1fr)]">
      <nav aria-label="Settings sections" className="self-start md:sticky md:top-24">
        <ul className="grid gap-1">
          {sectionItems.map(({ section: item, label, Icon }) => {
            const active = item === section;
            return (
              <li key={item}>
                <Link
                  href={`/settings?section=${item}`}
                  scroll={false}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-start gap-2.5 rounded-xl px-3 py-2 no-underline transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active
                      ? "bg-card text-foreground shadow-sm ring-1 ring-border"
                      : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                  )}
                >
                  <Icon className="mt-0.5 size-4 shrink-0" />
                  <span className="grid min-w-0">
                    <span className="text-sm font-bold">
                      {item === "account" ? accountLabel : label}
                    </span>
                    <span className="truncate text-xs font-normal text-muted-foreground">
                      {summaries[item]}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="min-w-0">
        {section === "appearance" ? renderThemeCard() : null}
        {section === "platforms" ? <PlatformsTabContent /> : null}
        {section === "account" ? renderAccountCard() : null}
        {section === "privacy" ? renderPrivacyCard() : null}
      </div>
    </div>
  );
}
