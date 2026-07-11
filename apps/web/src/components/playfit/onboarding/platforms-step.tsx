import type {
  ProductOnboardingDraft,
  ProductPlatformOption,
  ProductSeedData,
} from "@playfit/core/types";
import { ChevronRight } from "lucide-react";
import { motion } from "motion/react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog } from "@/components/ui/dialog";
import { Stack } from "@/components/ui/stack";
import { cn } from "@/lib/utils";
import type { PlatformPreset } from "./onboarding-helpers";
import { formatPlatformFamily, platformPresets } from "./onboarding-helpers";

export function PlatformsStep({
  draft,
  seedData,
  selectedIds,
  platformFamilies,
  platformsUnavailable,
  allSelected,
  showPlatformDetails,
  onShowPlatformDetailsChange,
  onTogglePlatform,
  onToggleAllPlatforms,
  onTogglePlatformPreset,
  onContinue,
}: {
  draft: ProductOnboardingDraft;
  seedData: ProductSeedData;
  selectedIds: Set<string>;
  platformFamilies: string[];
  platformsUnavailable: boolean;
  allSelected: boolean;
  showPlatformDetails: boolean;
  onShowPlatformDetailsChange: (open: boolean) => void;
  onTogglePlatform: (platformId: string, checked: boolean) => void;
  onToggleAllPlatforms: () => void;
  onTogglePlatformPreset: (preset: PlatformPreset) => void;
  onContinue: () => void;
}) {
  return (
    <motion.form
      key="platforms"
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="flex flex-col gap-6 flex-1 min-h-0"
      onSubmit={(event) => {
        event.preventDefault();
        onContinue();
      }}
    >
      <p className="text-sm text-muted-foreground/80">
        Start broad by selecting quick groups. You can customize individual systems in the panel
        below if needed.
      </p>
      {platformsUnavailable ? (
        <Alert variant="error">
          Platforms could not be loaded. Check the catalog connection and try again.
        </Alert>
      ) : null}
      <div className="grid gap-3">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
          Quick Groups
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {platformPresets.map((preset) => {
            const presetPlatforms = seedData.platforms.filter(preset.matches);
            const presetIds = presetPlatforms.map((platform) => platform.platformId);
            const selectedCount = presetIds.filter((id) => selectedIds.has(id)).length;
            const selected = presetIds.length > 0 && selectedCount === presetIds.length;
            const partiallySelected = selectedCount > 0 && !selected;

            return (
              <button
                key={preset.id}
                type="button"
                aria-pressed={selected}
                disabled={platformsUnavailable || presetIds.length === 0}
                className={cn(
                  "group grid min-h-28 content-between gap-3 rounded-2xl border border-white/5 bg-secondary/25 p-4 text-left transition-all duration-300 hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
                  selected &&
                    "border-accent/40 bg-accent/10 shadow-[0_0_20px_rgba(255,106,61,0.1)]",
                )}
                onClick={() => onTogglePlatformPreset(preset)}
              >
                <div className="flex items-start justify-between gap-2.5 w-full">
                  <span className="min-w-0">
                    <strong className="block text-sm font-extrabold text-foreground group-hover:text-accent transition-colors">
                      {preset.label}
                    </strong>
                    <span className="mt-1.5 block text-xs leading-relaxed text-muted-foreground line-clamp-2">
                      {preset.description}
                    </span>
                  </span>
                  {preset.Icon && (
                    <div
                      className={cn(
                        "size-8 shrink-0 rounded-xl grid place-items-center border border-white/5 bg-white/[0.02] text-muted-foreground group-hover:text-foreground transition-all duration-300",
                        selected &&
                          "border-accent/30 bg-accent/10 text-accent group-hover:text-accent",
                      )}
                    >
                      <preset.Icon className="size-4" />
                    </div>
                  )}
                </div>
                <span
                  className={cn(
                    "text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground/60 transition-colors",
                    selected && "text-accent",
                    partiallySelected && "text-foreground",
                  )}
                >
                  {selected
                    ? "Selected"
                    : partiallySelected
                      ? `${selectedCount} of ${presetIds.length}`
                      : `${presetIds.length} systems`}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="mt-auto sticky bottom-0 z-20 -mx-4 -mb-4 border-t border-white/5 bg-card/90 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-md md:relative md:m-0 md:rounded-2xl md:border md:border-white/5 md:bg-secondary/20 flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          <strong className="text-foreground">{draft.platforms.length}</strong> systems selected for
          Play Next.
        </p>
        <Stack direction="row" wrap gap={2} className="w-full sm:w-auto justify-end">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onShowPlatformDetailsChange(true)}
            className="text-xs hover:text-foreground"
          >
            Customize Platforms
          </Button>
          <Button
            type="submit"
            className="bg-accent text-accent-foreground font-extrabold hover:bg-accent/90"
          >
            {draft.platforms.length === 0 ? "Skip & Continue" : "Continue"}{" "}
            <ChevronRight className="size-4" />
          </Button>
        </Stack>
      </div>

      <PlatformDetailsDialog
        allSelected={allSelected}
        draft={draft}
        open={showPlatformDetails}
        platformFamilies={platformFamilies}
        platforms={seedData.platforms}
        platformsUnavailable={platformsUnavailable}
        onClose={() => onShowPlatformDetailsChange(false)}
        onToggleAllPlatforms={onToggleAllPlatforms}
        onTogglePlatform={onTogglePlatform}
      />
    </motion.form>
  );
}

function PlatformDetailsDialog({
  allSelected,
  draft,
  open,
  platformFamilies,
  platforms,
  platformsUnavailable,
  onClose,
  onToggleAllPlatforms,
  onTogglePlatform,
}: {
  allSelected: boolean;
  draft: ProductOnboardingDraft;
  open: boolean;
  platformFamilies: string[];
  platforms: ProductPlatformOption[];
  platformsUnavailable: boolean;
  onClose: () => void;
  onToggleAllPlatforms: () => void;
  onTogglePlatform: (platformId: string, checked: boolean) => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Customize Platforms"
      eyebrow="Platforms"
      className="max-w-md overflow-hidden"
    >
      <div className="max-h-[50vh] overflow-y-auto pr-1 grid gap-4">
        <Checkbox
          id="select-all-platforms"
          checked={allSelected}
          onChange={onToggleAllPlatforms}
          label={allSelected ? "Deselect all platforms" : "Select all platforms"}
          disabled={platformsUnavailable}
          className="font-bold sticky top-0 bg-background py-2 z-10"
        />
        <div className="grid gap-4 divide-y divide-white/5 pt-2">
          {platformFamilies.map((family) => {
            const group = platforms
              .filter((p) => p.family === family)
              .sort((a, b) => a.sortOrder - b.sortOrder);
            if (group.length === 0) return null;
            const label = formatPlatformFamily(family);
            const consoles = group.filter((p) => p.kind !== "handheld");
            const handhelds = group.filter((p) => p.kind === "handheld");
            return (
              <div key={family} className="grid gap-3 pt-3 first:pt-0 first:divide-y-0">
                {label && (
                  <p className="text-xs font-bold uppercase tracking-wide text-accent">{label}</p>
                )}
                <PlatformKindGroup
                  draft={draft}
                  group={consoles}
                  label={handhelds.length > 0 ? "Console / Hybrid" : null}
                  onTogglePlatform={onTogglePlatform}
                />
                <PlatformKindGroup
                  draft={draft}
                  group={handhelds}
                  label="Handheld"
                  padded
                  onTogglePlatform={onTogglePlatform}
                />
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-6 flex justify-end border-t border-white/5 pt-4">
        <Button
          type="button"
          onClick={onClose}
          className="bg-accent text-accent-foreground font-extrabold hover:bg-accent/90"
        >
          Apply Customization
        </Button>
      </div>
    </Dialog>
  );
}

function PlatformKindGroup({
  draft,
  group,
  label,
  padded = false,
  onTogglePlatform,
}: {
  draft: ProductOnboardingDraft;
  group: ProductPlatformOption[];
  label: string | null;
  padded?: boolean;
  onTogglePlatform: (platformId: string, checked: boolean) => void;
}) {
  if (group.length === 0) return null;

  return (
    <div className={padded ? "pt-2" : undefined}>
      {label ? (
        <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
      ) : null}
      <div className="grid gap-3 md:grid-cols-2">
        {group.map((platform) => {
          const checked = draft.platforms.some((entry) => entry.platformId === platform.platformId);
          return (
            <Checkbox
              key={platform.platformId}
              id={`platform-${platform.platformId}`}
              checked={checked}
              onChange={(event) =>
                onTogglePlatform(platform.platformId, event.currentTarget.checked)
              }
              label={platform.displayName}
            />
          );
        })}
      </div>
    </div>
  );
}
