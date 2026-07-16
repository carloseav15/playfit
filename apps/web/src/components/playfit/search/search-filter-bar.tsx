"use client";

import type { ProductPlatformOption } from "@playfit/core/types";
import {
  formatPlatformFamily,
  preferredPlatformFamilies,
} from "@/components/playfit/onboarding/onboarding-helpers";
import { formatDisplayGenre } from "@/components/playfit/product-utils";
import { Select } from "@/components/ui/select";
import { ToggleButton, ToggleGroup } from "@/components/ui/toggle-group";
import type { GenreOption } from "@/lib/games-db";

export function SearchFilterBar({
  platforms,
  genres,
  selectedFamily,
  selectedGenre,
  onFamilyChange,
  onGenreChange,
}: {
  platforms: ProductPlatformOption[];
  genres: GenreOption[];
  selectedFamily: string | null;
  selectedGenre: string | null;
  onFamilyChange: (family: string | null) => void;
  onGenreChange: (genre: string | null) => void;
}) {
  const families = [...new Set(platforms.map((p) => p.family))].sort(
    (a, b) => preferredPlatformFamilies.indexOf(a) - preferredPlatformFamilies.indexOf(b),
  );

  return (
    <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
      <fieldset className="grid min-w-0 gap-2">
        <legend className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          Platform
        </legend>
        <ToggleGroup>
          {families.map((family) => (
            <ToggleButton
              key={family}
              active={selectedFamily === family}
              onClick={() => onFamilyChange(selectedFamily === family ? null : family)}
            >
              {formatPlatformFamily(family)}
            </ToggleButton>
          ))}
        </ToggleGroup>
      </fieldset>

      {genres.length > 0 && (
        <div className="grid gap-2">
          <label
            htmlFor="search-genre"
            className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground"
          >
            Genre
          </label>
          <Select
            id="search-genre"
            value={selectedGenre ?? ""}
            onChange={(e) => onGenreChange(e.target.value || null)}
            className="w-full sm:w-48"
          >
            <option value="">All genres</option>
            {genres.map((g) => (
              <option key={g.genreId} value={g.genreId}>
                {formatDisplayGenre(g.name)}
              </option>
            ))}
          </Select>
        </div>
      )}
    </div>
  );
}
