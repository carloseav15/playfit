"use client";

import {
  ChevronRight,
  Gamepad2,
  Laptop,
  Moon,
  ShieldAlert,
  Sun,
  User,
  UserCheck,
} from "lucide-react";
import { PlatformsTabContent } from "../taste-shell";

interface SettingsMobileProps {
  subView: "menu" | "appearance" | "platforms" | "account" | "privacy";
  setSubView: (view: "menu" | "appearance" | "platforms" | "account" | "privacy") => void;
  renderThemeCard: () => React.ReactNode;
  renderAccountCard: () => React.ReactNode;
  renderPrivacyCard: () => React.ReactNode;
  // biome-ignore lint/suspicious/noExplicitAny: Supabase User type
  authUser: any;
  theme: string | undefined;
  platformsCount: number;
  setUseLocalProfile: (local: boolean) => void;
}

export function SettingsMobile({
  subView,
  setSubView,
  renderThemeCard,
  renderAccountCard,
  renderPrivacyCard,
  authUser,
  theme,
  platformsCount,
  setUseLocalProfile,
}: SettingsMobileProps) {
  return (
    <div className="flex flex-col gap-6 md:hidden">
      {subView === "menu" && (
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => setSubView("appearance")}
            className="w-full flex items-center justify-between p-4 bg-card border border-border rounded-2xl hover:border-border/80 transition-all text-left cursor-pointer"
          >
            <div className="flex items-center gap-3.5">
              <div className="size-10 rounded-xl bg-secondary/60 flex items-center justify-center text-muted-foreground">
                {theme === "light" ? (
                  <Sun className="size-5" />
                ) : theme === "dark" ? (
                  <Moon className="size-5" />
                ) : (
                  <Laptop className="size-5" />
                )}
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-extrabold text-foreground">App Appearance</span>
                <span className="text-xs text-muted-foreground mt-0.5">
                  Theme: {theme ? theme.charAt(0).toUpperCase() + theme.slice(1) : "System"}
                </span>
              </div>
            </div>
            <ChevronRight className="size-4 text-muted-foreground/60" />
          </button>

          <button
            type="button"
            onClick={() => setSubView("platforms")}
            className="w-full flex items-center justify-between p-4 bg-card border border-border rounded-2xl hover:border-border/80 transition-all text-left cursor-pointer"
          >
            <div className="flex items-center gap-3.5">
              <div className="size-10 rounded-xl bg-secondary/60 flex items-center justify-center text-muted-foreground">
                <Gamepad2 className="size-5" />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-extrabold text-foreground">Your Platforms</span>
                <span className="text-xs text-muted-foreground mt-0.5">
                  {platformsCount} {platformsCount === 1 ? "system" : "systems"} selected
                </span>
              </div>
            </div>
            <ChevronRight className="size-4 text-muted-foreground/60" />
          </button>

          {authUser ? (
            <button
              type="button"
              onClick={() => setSubView("account")}
              className="w-full flex items-center justify-between p-4 bg-card border border-border rounded-2xl hover:border-border/80 transition-all text-left cursor-pointer"
            >
              <div className="flex items-center gap-3.5">
                <div className="size-10 rounded-xl bg-secondary/60 flex items-center justify-center text-muted-foreground">
                  <UserCheck className="size-5 text-accent" />
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-extrabold text-foreground">Your Account</span>
                  <span className="text-xs text-muted-foreground mt-0.5">{authUser.email}</span>
                </div>
              </div>
              <ChevronRight className="size-4 text-muted-foreground/60" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setUseLocalProfile(false)}
              className="w-full flex items-center justify-between p-4 border border-accent/30 bg-accent/5 rounded-2xl hover:border-accent/60 transition-all text-left cursor-pointer"
            >
              <div className="flex items-center gap-3.5">
                <div className="size-10 rounded-xl bg-accent/10 flex items-center justify-center text-accent">
                  <User className="size-5" />
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-extrabold text-accent">Sign In / Sync Profile</span>
                  <span className="text-xs text-muted-foreground mt-0.5">
                    Save your preferences to the cloud
                  </span>
                </div>
              </div>
              <ChevronRight className="size-4 text-accent/60" />
            </button>
          )}

          <button
            type="button"
            onClick={() => setSubView("privacy")}
            className="w-full flex items-center justify-between p-4 bg-card border border-border rounded-2xl hover:border-border/80 transition-all text-left cursor-pointer"
          >
            <div className="flex items-center gap-3.5">
              <div className="size-10 rounded-xl bg-secondary/60 flex items-center justify-center text-muted-foreground">
                <ShieldAlert className="size-5" />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-extrabold text-foreground">Data & Privacy</span>
                <span className="text-xs text-muted-foreground mt-0.5">
                  Manage cache and profile preferences
                </span>
              </div>
            </div>
            <ChevronRight className="size-4 text-muted-foreground/60" />
          </button>
        </div>
      )}

      {subView === "appearance" && <div className="flex flex-col gap-4">{renderThemeCard()}</div>}

      {subView === "platforms" && (
        <div className="flex flex-col gap-4">
          <PlatformsTabContent />
        </div>
      )}

      {subView === "account" && <div className="flex flex-col gap-4">{renderAccountCard()}</div>}

      {subView === "privacy" && <div className="flex flex-col gap-4">{renderPrivacyCard()}</div>}
    </div>
  );
}
