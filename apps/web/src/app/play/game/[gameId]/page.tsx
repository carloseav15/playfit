import type { Metadata } from "next";
import { PlayDossierClient } from "@/components/playfit-mvp/play-dossier-client";
import { fetchPlatforms } from "@/lib/supabase/platforms";

export const metadata: Metadata = {
  title: "Why this game",
};

export default async function Page(props: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await props.params;
  const platforms = await fetchPlatforms();
  return <PlayDossierClient platforms={platforms} gameId={gameId} />;
}
