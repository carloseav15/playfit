import type { SeedGame } from "@playfit/core/types";
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

export function CoverArt({
  game,
  className,
  decorative = false,
  priority = false,
}: {
  game: SeedGame;
  className?: string;
  decorative?: boolean;
  priority?: boolean;
}) {
  const src = normalizeCoverSrc(game);
  const hue = hashToHue(game.gameId);
  const alt = decorative ? "" : `${game.title} cover art`;

  // Safe initials generation stripping symbols like trademarks, parenthesis, etc.
  const placeholder =
    (game.title || "")
      .replace(/[^\w\s]/g, "")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase() || "?";

  const placeholderClassName =
    "grid h-full w-full place-items-center p-2 text-center text-[10px] sm:text-xs font-black uppercase tracking-[0.15em] text-white/80";
  const placeholderStyle = {
    background: `linear-gradient(135deg, hsl(${hue}, 40%, 18%), hsl(${(hue + 50) % 360}, 30%, 26%))`,
  };

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-sm border border-border bg-black/40 shadow-[0_8px_16px_-4px_rgba(0,0,0,0.5),0_4px_6px_-2px_rgba(0,0,0,0.3)] after:content-[''] after:absolute after:inset-y-0 after:left-0 after:w-[1.5px] after:bg-white/20 after:pointer-events-none",
        className,
      )}
    >
      {src ? (
        src.startsWith("http") ? (
          <Image
            src={src}
            alt={alt}
            className="h-full w-full object-cover"
            width={260}
            height={390}
            priority={priority}
            unoptimized
          />
        ) : (
          <Image
            src={src}
            alt={alt}
            className="h-full w-full object-cover"
            width={260}
            height={390}
            priority={priority}
          />
        )
      ) : decorative ? (
        <div aria-hidden="true" className={placeholderClassName} style={placeholderStyle}>
          {placeholder}
        </div>
      ) : (
        <div
          role="img"
          aria-label={`${game.title} cover art`}
          className={placeholderClassName}
          style={placeholderStyle}
        >
          {placeholder}
        </div>
      )}
    </div>
  );
}
