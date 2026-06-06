import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFoundPage() {
  return (
    <main className="grid min-h-screen place-items-center p-6 text-center">
      <div className="grid max-w-sm gap-5">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
          Playfit · 404
        </p>
        <h1 className="font-display text-5xl font-black tracking-tight">Page not found</h1>
        <p className="text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Button asChild>
          <Link href="/">
            <ArrowLeft className="size-4" />
            Back to Playfit
          </Link>
        </Button>
      </div>
    </main>
  );
}
