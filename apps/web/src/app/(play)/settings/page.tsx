import type { Metadata } from "next";
import { parseSettingsSection } from "@/components/playfit/desktop/settings-desktop";
import { SettingsShell } from "@/components/playfit/settings-shell";
import { ErrorBoundary } from "@/components/ui/error-boundary";

export const metadata: Metadata = {
  title: "Settings — Configure Your Preferences",
  description: "Set your platforms, system preferences, and theme choices for recommendations.",
};

export default async function SettingsPage(props: { searchParams: Promise<{ section?: string }> }) {
  const { section } = await props.searchParams;
  return (
    <ErrorBoundary>
      <SettingsShell section={parseSettingsSection(section)} />
    </ErrorBoundary>
  );
}
