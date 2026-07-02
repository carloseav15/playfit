"use client";

import { ArrowLeft, Laptop, Moon, Sun } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { ToggleButton, ToggleGroup } from "@/components/ui/toggle-group";
import { useHeader } from "../playfit/header-context";
import { usePlayfit } from "../playfit/playfit-context";
import { SettingsDesktop } from "./desktop/settings-desktop";
import { SettingsMobile } from "./mobile/settings-mobile";
import { PlayRouteTabs } from "./play-route-tabs";

export function SettingsShell() {
  const {
    state,
    authUser,
    setUseLocalProfile,
    signOut,
    linkGoogleAccount,
    resetTasteProfile,
    deleteAccount,
  } = usePlayfit();
  const pathname = usePathname();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [linkingAccount, setLinkingAccount] = useState(false);
  const [subView, setSubView] = useState<
    "menu" | "appearance" | "platforms" | "account" | "privacy"
  >("menu");
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [actionPending, setActionPending] = useState(false);
  const profileReady = !!state.user.onboardingCompletedAt && !!state.user.profile;

  useHeader(
    subView === "appearance"
      ? { title: "App Appearance", onBack: () => setSubView("menu") }
      : subView === "platforms"
        ? { title: "Your Platforms", onBack: () => setSubView("menu") }
        : subView === "account"
          ? { title: "Your Account", onBack: () => setSubView("menu") }
          : subView === "privacy"
            ? { title: "Data & Privacy", onBack: () => setSubView("menu") }
            : {},
    [subView],
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!profileReady) {
    return (
      <div className="min-h-screen text-foreground relative flex items-center justify-center">
        <Container as="main" size="sm" className="py-8">
          <Card className="rounded-3xl border border-border bg-card shadow-lg p-6 text-center">
            <CardHeader className="px-0 pt-0">
              <CardTitle className="text-2xl font-black">Set up your taste first</CardTitle>
              <CardDescription className="text-xs text-muted-foreground mt-1">
                Select your platforms and a few favorite games so we can build your recommendations.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0 pb-0 pt-4">
              <Button
                type="button"
                asChild
                className="bg-accent text-accent-foreground font-extrabold hover:bg-accent/90"
              >
                <Link href="/play">Start Play Next</Link>
              </Button>
            </CardContent>
          </Card>
        </Container>
      </div>
    );
  }

  const renderThemeCard = () => (
    <Card className="rounded-3xl border border-border bg-card shadow-lg">
      <CardHeader>
        <CardTitle className="text-lg font-black text-foreground">App Appearance</CardTitle>
        <CardDescription className="text-xs text-muted-foreground mt-0.5">
          Choose your preferred theme for the interface.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {mounted ? (
          <ToggleGroup className="w-full md:max-w-sm grid grid-cols-3 gap-2 bg-secondary/30 p-1 rounded-2xl border border-border/40">
            <ToggleButton
              active={theme === "light"}
              onClick={() => setTheme("light")}
              className="h-10 text-xs font-bold rounded-xl flex items-center justify-center gap-2"
            >
              <Sun className="size-4" /> Light
            </ToggleButton>
            <ToggleButton
              active={theme === "dark"}
              onClick={() => setTheme("dark")}
              className="h-10 text-xs font-bold rounded-xl flex items-center justify-center gap-2"
            >
              <Moon className="size-4" /> Dark
            </ToggleButton>
            <ToggleButton
              active={theme === "system"}
              onClick={() => setTheme("system")}
              className="h-10 text-xs font-bold rounded-xl flex items-center justify-center gap-2"
            >
              <Laptop className="size-4" /> System
            </ToggleButton>
          </ToggleGroup>
        ) : (
          <div className="h-12 w-full md:max-w-sm rounded-2xl bg-secondary/30 animate-pulse border border-border/40" />
        )}
      </CardContent>
    </Card>
  );

  const renderAccountCard = () => (
    <Card className="rounded-3xl border border-border bg-card shadow-lg">
      <CardHeader>
        <CardTitle className="text-lg font-black text-foreground">
          {authUser ? "Account" : "Cloud Synchronization"}
        </CardTitle>
        <CardDescription className="text-xs text-muted-foreground mt-0.5">
          {authUser
            ? "Your recommendations and taste profile are synchronized to the cloud."
            : "Save your library and preferences to access them from any device."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {authUser ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-secondary/30 border border-border/40">
            <div className="flex flex-col">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                {authUser.isAnonymous ? "Guest session" : "Signed in as"}
              </span>
              <span className="text-sm font-extrabold text-foreground mt-0.5">
                {authUser.email}
              </span>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              {authUser.isAnonymous ? (
                <Button
                  type="button"
                  onClick={async () => {
                    setLinkingAccount(true);
                    await linkGoogleAccount();
                    setLinkingAccount(false);
                  }}
                  disabled={linkingAccount}
                  loading={linkingAccount}
                  className="text-xs font-bold h-10 px-4 rounded-xl shrink-0"
                >
                  Link Google
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                onClick={signOut}
                className="text-xs font-bold h-10 px-4 rounded-xl hover:text-destructive hover:bg-destructive/10 hover:border-destructive/30 shrink-0"
              >
                Sign Out
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl border border-accent/25 bg-accent/5">
            <div className="flex flex-col">
              <span className="text-xs font-bold text-accent uppercase tracking-wider">
                Local Profile Only
              </span>
              <span className="text-sm font-extrabold text-foreground mt-0.5">
                Your library is saved locally in this browser.
              </span>
            </div>
            <Button
              type="button"
              onClick={() => setUseLocalProfile(false)}
              className="text-xs font-bold h-10 px-4 rounded-xl bg-accent text-accent-foreground hover:bg-accent/90 shrink-0"
            >
              Sign In / Sync
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );

  const handleReset = async () => {
    setActionPending(true);
    await resetTasteProfile();
    setActionPending(false);
    setConfirmReset(false);
    router.push("/play");
  };

  const handleDelete = async () => {
    setActionPending(true);
    await deleteAccount();
    setActionPending(false);
    setConfirmDelete(false);
    router.push("/play");
  };

  const renderPrivacyCard = () => (
    <Card className="rounded-3xl border border-border bg-card shadow-lg">
      <CardHeader>
        <CardTitle className="text-lg font-black text-foreground">Data & Privacy</CardTitle>
        <CardDescription className="text-xs text-muted-foreground mt-0.5">
          Manage your personal data, local taste storage, and account settings.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-2xl bg-secondary/20 border border-border/40">
            <div className="flex flex-col gap-1 max-w-md">
              <span className="text-sm font-extrabold text-foreground">Reset Taste Profile</span>
              <span className="text-xs text-muted-foreground leading-relaxed">
                Deletes all taste preferences, ratings, library history, and platform selection.
                Your active account session stays, and you will restart calibration.
              </span>
            </div>
            <div className="shrink-0 flex items-center gap-2">
              {confirmReset ? (
                <>
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={handleReset}
                    disabled={actionPending}
                    loading={actionPending}
                    className="text-xs font-bold h-10 px-4 rounded-xl"
                  >
                    Confirm Reset
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setConfirmReset(false)}
                    disabled={actionPending}
                    className="text-xs font-bold h-10 px-3 rounded-xl"
                  >
                    Cancel
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setConfirmReset(true)}
                  className="text-xs font-bold h-10 px-4 rounded-xl hover:text-destructive hover:bg-destructive/10 hover:border-destructive/30"
                >
                  Reset Profile
                </Button>
              )}
            </div>
          </div>

          {authUser && (
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-2xl bg-destructive/5 border border-destructive/10">
              <div className="flex flex-col gap-1 max-w-md">
                <span className="text-sm font-extrabold text-destructive">
                  Delete Cloud Profile
                </span>
                <span className="text-xs text-muted-foreground leading-relaxed">
                  Permanently deletes your Playfit profile and synchronized taste data, clears
                  local Playfit data, and signs you out. Your account sign-in credentials are not
                  deleted.
                </span>
              </div>
              <div className="shrink-0 flex items-center gap-2">
                {confirmDelete ? (
                  <>
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={handleDelete}
                      disabled={actionPending}
                      loading={actionPending}
                      className="text-xs font-bold h-10 px-4 rounded-xl"
                    >
                      Confirm Delete
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setConfirmDelete(false)}
                      disabled={actionPending}
                      className="text-xs font-bold h-10 px-3 rounded-xl"
                    >
                      Cancel
                    </Button>
                  </>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setConfirmDelete(true)}
                    className="text-xs font-bold h-10 px-4 rounded-xl hover:text-destructive hover:bg-destructive/10 hover:border-destructive/30"
                  >
                    Delete Cloud Profile
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="relative"
    >
      <div className="pointer-events-none absolute left-1/4 top-1/4 size-[400px] rounded-full bg-accent/5 blur-[100px]" />
      <div className="pointer-events-none absolute right-1/4 bottom-1/4 size-[350px] rounded-full bg-indigo-500/5 blur-[90px]" />

      <div className="min-h-[calc(100vh-4rem)] text-foreground">
        <Container as="main" size="md" className="flex flex-col gap-6 py-6 lg:py-8">
          <div className="hidden md:flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between shrink-0">
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="ghost"
                asChild
                className="text-xs hover:text-foreground hover:bg-secondary h-11 px-3.5 rounded-xl shrink-0"
              >
                <Link href="/play" className="flex items-center">
                  <ArrowLeft className="size-4 mr-1.5" />
                  Back
                </Link>
              </Button>
              <h1 className="font-display text-lg sm:text-xl font-black tracking-tight text-foreground truncate">
                Settings
              </h1>
            </div>
            <PlayRouteTabs pathname={pathname} className="w-full sm:w-auto" />
          </div>

          {/* Mobile sub-views */}
          <SettingsMobile
            subView={subView}
            setSubView={setSubView}
            renderThemeCard={renderThemeCard}
            renderAccountCard={renderAccountCard}
            renderPrivacyCard={renderPrivacyCard}
            authUser={authUser}
            theme={theme}
            platformsCount={state.user.onboarding.platforms.length}
            setUseLocalProfile={setUseLocalProfile}
          />

          {/* Desktop Layout */}
          <SettingsDesktop
            renderThemeCard={renderThemeCard}
            renderAccountCard={renderAccountCard}
            renderPrivacyCard={renderPrivacyCard}
          />
        </Container>
      </div>
    </motion.div>
  );
}
