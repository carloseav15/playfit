"use client";

import { PlayfitProvider } from "@/components/playfit/playfit-context";
import { ErrorBoundary } from "@/components/ui/error-boundary";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <PlayfitProvider>
      <ErrorBoundary>{children}</ErrorBoundary>
    </PlayfitProvider>
  );
}
