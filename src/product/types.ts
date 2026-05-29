import type { Level, Pace } from "../shared/taste-types";

export type ProductAccessStatus = "available" | "limited" | "planned";
export type ProductPriority = "low" | "medium" | "high";
export type ProductConfidence = "low" | "medium" | "high";
export type ProductRuntimeMode = "ai-assisted" | "local-only";
export type SeedSource = "catalog" | "universe" | "finder";
export type ProductAnchorReason =
  | "story"
  | "pace"
  | "combat"
  | "repetition"
  | "grind"
  | "confusion"
  | "difficulty"
  | "aesthetic"
  | "emotion";
export type ProductOnboardingStep =
  | "platforms"
  | "anchors"
  | "interview"
  | "confirm";
export type ProductGameStatus =
  | "playing"
  | "backlog"
  | "on_hold"
  | "shelved"
  | "interested"
  | "beaten"
  | "completed"
  | "dropped"
  | "abandoned"
  | "dismissed";
export type ProductGameSentiment = "liked" | "mixed" | "disliked";
export type ProductCollectionStatus = "backlog" | "wishlist";
export type FinderActionType = "saved" | "dismissed" | "current_run" | "abandoned" | "dropped" | "not_owned";
export type PlatformAvailability = "available" | "unavailable" | "unknown";
export type GameAccessStatus = "playable" | "not_on_platforms" | "unknown_platform" | "unreleased";
export type ProfileSignalTone = "positive" | "negative";
export type SeedReleaseState = "released" | "unreleased";
export type ProductOwnershipStatus = "owned" | "wishlist" | "not_owned" | "unknown";

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

export interface ProductInterviewAnswers {
  love: string;
  frustration: string;
  priorities: string;
  playPattern: string;
  selectedPriorities: string[];
  selectedFrictionSignals: string[];
  selectedPlayPattern: string;
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
  currentGameId: string | null;
  anchorReasons: Record<string, ProductAnchorReason[]>;
  anchorOwnership: Record<string, ProductOwnershipStatus>;
  answers: ProductInterviewAnswers;
  draftProfile: ProductProfile | null;
}

export interface ProductGameState {
  gameId: string;
  title: string;
  sentiment?: ProductGameSentiment;
  status?: ProductGameStatus;
  collectionStatus?: ProductCollectionStatus;
  ownershipStatus?: ProductOwnershipStatus;
  rating?: number;
  notes?: string;
  source: "onboarding" | "finder" | "manual";
  createdAt: string;
  updatedAt: string;
}

export interface ProductCheckin {
  id: string;
  gameId: string;
  note: string;
  tags: string[];
  createdAt: string;
}

export interface FinderActionRecord {
  gameId: string;
  action: FinderActionType;
  createdAt: string;
}

export interface ProductUserState {
  onboarding: ProductOnboardingDraft;
  onboardingCompletedAt: string | null;
  profile: ProductProfile | null;
  profileOverrides: ProductProfileOverrides;
  gameStates: Record<string, ProductGameState>;
  checkins: ProductCheckin[];
  finderActions: Record<string, FinderActionRecord>;
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
  ownershipStatus: ProductOwnershipStatus;
  collectionStatus: ProductCollectionStatus | null;
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

export interface FinderInsight {
  summary: string;
  fitReasons: string[];
  cautionReasons: string[];
  confidence: ProductConfidence;
}

export interface CheckinInterpretation {
  summary: string;
  tags: string[];
}
