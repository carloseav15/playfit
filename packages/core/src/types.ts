export type ProductAccessStatus = "available" | "limited" | "planned";
export type ProductPriority = "low" | "medium" | "high";
export type ProductConfidence = "low" | "medium" | "high";
export type SeedSource = "catalog" | "universe" | "finder";
export type ProductOnboardingStep = "platforms" | "anchors" | "dislikes";
export type ProductPlayStatus =
  | "playing"
  | "on_hold"
  | "shelved"
  | "beaten"
  | "completed"
  | "abandoned"
  | "want_to_play";
export type ProductDecisionFeedback = "play" | "later" | "loved" | "liked" | "mixed" | "not_for_me";
export type PlatformAvailability = "available" | "unavailable" | "unknown";
export type GameAccessStatus = "playable" | "not_on_platforms" | "unknown_platform" | "unreleased";
export type ProfileSignalTone = "positive" | "negative";
export type SeedReleaseState = "released" | "unreleased";
export type ProductRating = 0 | 0.5 | 1 | 1.5 | 2 | 2.5 | 3 | 3.5 | 4 | 4.5 | 5;

export interface SeedGame {
  gameId: string;
  title: string;
  aliases: string[];
  series: string;
  seriesId?: string;
  source: SeedSource;
  primaryGenre: string;
  genreId?: string;
  tags: string[];
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
  kind: "console" | "handheld" | "hybrid" | "computer" | "other";
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
  likedGenres: string[];
  avoidedGenres: string[];
  likedTags: Record<string, number>;
  dislikedTags: Record<string, number>;
  ratedCount: number;
  signals: ProductProfileSignal[];
}

export interface ProductPlatformSelection {
  platformId: string;
  status: ProductAccessStatus;
}

export interface ProductOnboardingDraft {
  step: ProductOnboardingStep;
  platforms: ProductPlatformSelection[];
  likedGameIds: string[];
  dislikedGameIds: string[];
}

export interface ProductGameState {
  gameId: string;
  title: string;
  status?: ProductPlayStatus;
  rating?: ProductRating;
  inBacklog: boolean;
  inWishlist: boolean;
  excluded?: boolean;
  source: "onboarding" | "finder" | "manual";
  createdAt: string;
  updatedAt: string;
}

export interface ProductUserState {
  onboarding: ProductOnboardingDraft;
  onboardingCompletedAt: string | null;
  profile: ProductProfile | null;
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
  similarGames: Array<{ gameId: string; title: string; similarity: number }>;
}

export interface ProductTodayModel {
  currentRun: RankedSeedGame[];
  nextUp: RankedSeedGame[];
  resume: RankedSeedGame[];
}
