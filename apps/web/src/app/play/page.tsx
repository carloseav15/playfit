import type { Metadata } from "next";
import { PlayPageClient } from "@/components/playfit-mvp/play-page-client";
import { fetchPlatforms } from "@/lib/supabase/platforms";

export const metadata: Metadata = {
  title: "Play Next",
  description: "Find what to play next with Playfit.",
};

export default async function PlayPage() {
  const platforms = await fetchPlatforms();
  return <PlayPageClient platforms={platforms} />;
}
