"use client";

import { RotateCcw } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function AppRouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="grid min-h-screen place-items-center p-6 text-center">
      <div className="grid max-w-sm gap-5">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
          Playfit · App
        </p>
        <h1 className="font-display text-3xl font-extrabold tracking-tight">
          Playfit could not load
        </h1>
        <p className="text-muted-foreground">
          {error.message || "The catalog connection failed. Please try again."}
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Button type="button" onClick={reset}>
            <RotateCcw className="size-4" />
            Try again
          </Button>
          <Button type="button" variant="secondary" asChild>
            <Link href="/">Go home</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
