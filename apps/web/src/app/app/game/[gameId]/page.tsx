import type { Metadata } from "next";
import { GameDetailPage } from "@/components/playfit/game-detail-page";
import { ErrorBoundary } from "@/components/ui/error-boundary";

export const metadata: Metadata = {
  title: "Game Details",
};

export default async function Page(props: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await props.params;
  return (
    <ErrorBoundary>
      <GameDetailPage gameId={gameId} />
    </ErrorBoundary>
  );
}
