import type { Metadata } from "next";
import { DecisionDossier } from "@/components/playfit/decision-dossier";
import { ErrorBoundary } from "@/components/ui/error-boundary";

export const metadata: Metadata = {
  title: "Why this game",
};

export default async function Page(props: {
  params: Promise<{ gameId: string }>;
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { gameId } = await props.params;
  const { returnTo } = await props.searchParams;

  return (
    <ErrorBoundary>
      <DecisionDossier gameId={gameId} returnTo={returnTo} />
    </ErrorBoundary>
  );
}
