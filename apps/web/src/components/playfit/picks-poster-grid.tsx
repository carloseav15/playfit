import type { RankedSeedGame } from "@playfit/core/types";
import Link from "next/link";
import { CoverArt } from "./cover-art";

const PICKS_RETURN_TO = "/picks";

export const PICKS_POSTER_GRID_CLASS_NAME =
  "grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))]";

function PickPosterCard({ entry }: { entry: RankedSeedGame }) {
  const { gameId, title } = entry.game;
  return (
    <li className="min-w-0">
      <Link
        href={`/game/${gameId}?returnTo=${encodeURIComponent(PICKS_RETURN_TO)}`}
        className="group block rounded-md outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <div className="relative">
          <CoverArt
            game={entry.game}
            decorative
            className="w-full rounded-sm transition duration-300 motion-safe:group-hover:-translate-y-0.5 group-hover:shadow-xl"
          />
          <span
            aria-hidden="true"
            className="absolute right-1.5 top-1.5 flex flex-col items-center rounded-md bg-accent px-1.5 py-0.5 leading-none sm:px-2 sm:py-1 text-accent-foreground shadow-lg ring-1 ring-black/20"
          >
            <strong className="text-base font-black tabular-nums sm:text-lg">
              {entry.affinityScore}
            </strong>
            <span className="mt-0.5 text-[8px] font-bold uppercase tracking-wider sm:text-[9px]">
              match
            </span>
          </span>
        </div>
        <h2 className="mt-2.5 line-clamp-2 text-sm font-bold leading-snug text-foreground group-hover:text-accent">
          {title}
        </h2>
        <span className="sr-only">{entry.affinityScore} out of 100 match</span>
      </Link>
    </li>
  );
}

export function PicksPosterGrid({ picks }: { picks: RankedSeedGame[] }) {
  return (
    <ul
      aria-label={`Saved picks, ${picks.length}`}
      className={`${PICKS_POSTER_GRID_CLASS_NAME} pb-4`}
    >
      {picks.map((entry) => (
        <PickPosterCard key={entry.game.gameId} entry={entry} />
      ))}
    </ul>
  );
}
