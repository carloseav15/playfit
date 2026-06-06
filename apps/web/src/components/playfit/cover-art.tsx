import type { SeedGame } from "@playfit/core";
import Image from "next/image";

import { cn } from "@/lib/utils";

export function CoverArt({ game, className }: { game: SeedGame; className?: string }) {
  const raw = game.coverPath || game.externalCoverUrl;
  const src = raw && !raw.startsWith("http") && !raw.startsWith("/") ? `/${raw}` : raw;
  return (
    <div className={cn("overflow-hidden rounded-md border border-border bg-black/40", className)}>
      {src ? (
        src.startsWith("http") ? (
          <Image
            src={src}
            alt={`${game.title} cover art`}
            className="h-full w-full object-contain"
            width={260}
            height={390}
            unoptimized
          />
        ) : (
          <Image
            src={src}
            alt={`${game.title} cover art`}
            className="h-full w-full object-contain"
            width={260}
            height={390}
          />
        )
      ) : (
        <div className="grid h-full min-h-32 place-items-center p-4 text-center text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
          {game.title
            .split(" ")
            .filter(Boolean)
            .slice(0, 2)
            .map((w) => w[0])
            .join("")}
        </div>
      )}
    </div>
  );
}
