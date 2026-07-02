import type { Metadata } from "next";
import { SettingsShell } from "@/components/playfit/settings-shell";
import { ErrorBoundary } from "@/components/ui/error-boundary";

export const metadata: Metadata = {
  title: "Playfit Settings — Configure Your Preferences",
  description: "Set your platforms, system preferences, and theme choices for recommendations.",
};

export default async function SettingsPage() {
  return (
    <ErrorBoundary>
      <SettingsShell />
    </ErrorBoundary>
  );
}
