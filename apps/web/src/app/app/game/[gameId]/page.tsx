import { GameDetailPage } from "@/components/playfit/game-detail-page";

export default async function Page(props: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await props.params;
  return <GameDetailPage gameId={gameId} />;
}
