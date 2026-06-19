"use client";

import { PlatformsTabContent } from "../taste-shell";

interface SettingsDesktopProps {
  renderThemeCard: () => React.ReactNode;
  renderAccountCard: () => React.ReactNode;
}

export function SettingsDesktop({ renderThemeCard, renderAccountCard }: SettingsDesktopProps) {
  return (
    <div className="hidden md:flex flex-col gap-6">
      {renderThemeCard()}
      {renderAccountCard()}
      <PlatformsTabContent />
    </div>
  );
}
