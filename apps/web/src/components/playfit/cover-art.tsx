import type { SeedGame } from "@playfit/core";
import Image from "next/image";

import { cn } from "@/lib/utils";

function normalizeCoverSrc(game: SeedGame) {
  const raw = game.coverPath || game.externalCoverUrl;
  if (!raw) return null;
  if (raw.startsWith("http")) return raw;

  const src = raw.startsWith("/") ? raw : `/${raw}`;
  return src.startsWith("/covers/games/") ? src : null;
}

function hashToHue(id: string | undefined) {
  if (!id) return 200;
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  return (((hash * 137.5) % 360) + 360) % 360;
}

export function CoverArt({ game, className }: { game: SeedGame; className?: string }) {
  const src = normalizeCoverSrc(game);
  const hue = hashToHue(game.gameId);
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
        <div
          className="grid h-full min-h-32 place-items-center p-4 text-center text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground"
          style={{
            background: `linear-gradient(135deg, hsl(${hue}, 40%, 20%), hsl(${(hue + 60) % 360}, 30%, 30%))`,
          }}
        >
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
