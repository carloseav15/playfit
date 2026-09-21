import type { Metadata } from "next";
import { parseTasteSection } from "@/components/playfit/taste/taste-sections";
import { TasteShell } from "@/components/playfit/taste-shell";
import { ErrorBoundary } from "@/components/ui/error-boundary";

export const metadata: Metadata = {
  title: "Your Gaming Taste Profile",
  description: "Explore what Playfit is learning from your active decisions and ratings.",
};

export default async function TastePage(props: { searchParams: Promise<{ section?: string }> }) {
  const { section } = await props.searchParams;
  return (
    <ErrorBoundary>
      <TasteShell section={parseTasteSection(section)} />
    </ErrorBoundary>
  );
}
