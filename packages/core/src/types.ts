import type { Level, Pace } from "./taste-types";

export type ProductAccessStatus = "available" | "limited" | "planned";
export type ProductPriority = "low" | "medium" | "high";
export type ProductConfidence = "low" | "medium" | "high";
export type SeedSource = "catalog" | "universe" | "finder";
export type ProductOnboardingStep = "platforms" | "anchors";
export type ProductPlayStatus =
  | "playing"
  | "on_hold"
  | "shelved"
  | "beaten"
  | "completed"
  | "abandoned";
export type PlatformAvailability = "available" | "unavailable" | "unknown";
export type GameAccessStatus = "playable" | "not_on_platforms" | "unknown_platform" | "unreleased";
export type ProfileSignalTone = "positive" | "negative";
export type SeedReleaseState = "released" | "unreleased";
export type ProductRating = 0 | 0.5 | 1 | 1.5 | 2 | 2.5 | 3 | 3.5 | 4 | 4.5 | 5;

export interface SeedGame {
  gameId: string;
  title: string;
  aliases?: string[];
  series: string;
  source: SeedSource;
  scoringStatus?: "scored" | "basic";
  primaryGenre: string;
  combatStyle: string;
  storyStrength: Level;
  progressionClarity: Level;
  earlyHook: Level;
  aestheticFit: Level;
  emotionalComplexity: Level;
  combatDepth: Level;
  endgameRepetitionRisk: Level;
  pacingSpeed: Pace;
  notes: string;
  coverPath: string;
  externalCoverUrl?: string;
  releaseYear?: string;
  sourceRef?: string;
  availablePlatformIds: string[];
  availablePlatformNames: string[];
  releaseState: SeedReleaseState;
  sortDate?: string;
  releaseLabel?: string;
}

export interface ProductPlatformOption {
  platformId: string;
  displayName: string;
  family: string;
  activeStatus: string;
  sortOrder: number;
}

export interface ProductProfileSignal {
  id: string;
  tone: ProfileSignalTone;
  label: string;
  reason: string;
}

export interface ProductProfile {
  summary: string;
  priorities: {
    story: ProductPriority;
    progression: ProductPriority;
    hook: ProductPriority;
    aesthetic: ProductPriority;
    emotional: ProductPriority;
    combat: ProductPriority;
    pace: ProductPriority;
  };
  avoidPatterns: {
    slowStart: boolean;
    repetition: boolean;
    confusingSystems: boolean;
    weakEmotionalPull: boolean;
    shallowCombat: boolean;
  };
  likedGenres: string[];
  avoidedGenres: string[];
  watchVsPlayRisk: ProductConfidence;
  signals: ProductProfileSignal[];
}

export interface ProductProfileOverrides {
  priorities?: Partial<ProductProfile["priorities"]>;
  avoidPatterns?: Partial<ProductProfile["avoidPatterns"]>;
  watchVsPlayRisk?: ProductConfidence;
}

export interface ProductPlatformSelection {
  platformId: string;
  status: ProductAccessStatus;
}

export interface ProductOnboardingDraft {
  step: ProductOnboardingStep;
  platforms: ProductPlatformSelection[];
  likedGameIds: string[];
}

export interface ProductGameState {
  gameId: string;
  title: string;
  status?: ProductPlayStatus;
  rating?: ProductRating;
  storyCompleted?: boolean;
  inBacklog: boolean;
  inWishlist: boolean;
  source: "onboarding" | "finder" | "manual";
  createdAt: string;
  updatedAt: string;
}

export interface ProductUserState {
  onboarding: ProductOnboardingDraft;
  onboardingCompletedAt: string | null;
  profile: ProductProfile | null;
  profileOverrides: ProductProfileOverrides;
  gameStates: Record<string, ProductGameState>;
  lastUpdatedAt: string | null;
}

export interface ProductState {
  version: number;
  user: ProductUserState;
}

export interface ProductSeedData {
  allGames: SeedGame[];
  catalogGames: SeedGame[];
  gamesById: Map<string, SeedGame>;
  platforms: ProductPlatformOption[];
}

export interface RankedSeedGame {
  game: SeedGame;
  affinityScore: number;
  riskScore: number;
  confidence: ProductConfidence;
  fitReasons: string[];
  cautionReasons: string[];
  platformAvailability: PlatformAvailability;
  accessStatus: GameAccessStatus;
  inBacklog: boolean;
  inWishlist: boolean;
}

export interface ProductTodayModel {
  currentRun: RankedSeedGame | null;
  playingNow: RankedSeedGame[];
  nextUp: RankedSeedGame | null;
  avoid: RankedSeedGame | null;
  resume: RankedSeedGame | null;
  wishlistFit: RankedSeedGame | null;
  worthTracking: RankedSeedGame | null;
  playableAlternative: RankedSeedGame | null;
}
