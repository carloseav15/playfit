import type { Level, Pace } from "../../shared/taste-types";

export type { Level, Pace } from "../../shared/taste-types";

export const DATA_FILES = {
  profile: "user_profile.csv",
  catalog: "games_catalog.csv",
  upcomingReleases: "upcoming_releases.csv",
  platforms: "platforms.csv",
  userPlatformAccess: "user_platform_access.csv",
  gamePlatforms: "game_platforms.csv",
  upcomingReleasePlatforms: "upcoming_release_platforms.csv",
  opinions: "user_game_opinions.csv",
  recommendations: "recommendation_log.csv",
  checkins: "session_checkins.csv",
  franchiseMaster: "franchise_master_entries.csv",
  franchiseProgress: "user_franchise_progress.csv",
  franchiseCovers: "franchise_cover_assets.csv",
  gameCovers: "game_cover_assets.csv",
} as const;

export const REQUIRED_HEADERS = {
  profile: [
    "preference_id",
    "category",
    "key",
    "value",
    "weight",
    "confidence",
    "evidence",
    "last_updated",
  ],
  catalog: [
    "game_id",
    "title",
    "series",
    "primary_genre",
    "combat_style",
    "story_strength",
    "progression_clarity",
    "early_hook",
    "aesthetic_fit",
    "emotional_complexity",
    "combat_depth",
    "endgame_repetition_risk",
    "pacing_speed",
    "notes",
  ],
  upcomingReleases: [
    "release_id",
    "game_id",
    "title",
    "series",
    "platforms",
    "sort_date",
    "release_label",
    "primary_genre",
    "combat_style",
    "story_strength",
    "progression_clarity",
    "early_hook",
    "aesthetic_fit",
    "emotional_complexity",
    "combat_depth",
    "endgame_repetition_risk",
    "pacing_speed",
    "source_ref",
    "notes",
  ],
  platforms: [
    "platform_id",
    "display_name",
    "family",
    "vendor",
    "generation",
    "kind",
    "sort_order",
    "active_status",
    "notes",
  ],
  userPlatformAccess: [
    "access_id",
    "platform_id",
    "access_status",
    "device_label",
    "notes",
  ],
  gamePlatforms: [
    "mapping_id",
    "game_id",
    "platform_id",
    "availability_status",
    "source_type",
    "source_ref",
    "notes",
  ],
  upcomingReleasePlatforms: [
    "release_platform_id",
    "release_id",
    "platform_id",
    "sort_date",
    "release_label",
    "source_ref",
    "notes",
  ],
  opinions: [
    "opinion_id",
    "game_id",
    "title",
    "status",
    "overall_score",
    "story_score",
    "progression_score",
    "hook_score",
    "aesthetic_score",
    "emotional_complexity_score",
    "combat_depth_score",
    "endgame_repetition_penalty",
    "pacing_score",
    "narrative_payoff_score",
    "confidence",
    "notes",
    "last_updated",
  ],
  recommendations: [
    "recommendation_id",
    "game_id",
    "title",
    "recommended_on",
    "recommendation_type",
    "fit_estimate",
    "status",
    "reason",
    "user_feedback",
    "next_action",
  ],
  checkins: [
    "checkin_id",
    "game_id",
    "title",
    "checkin_date",
    "mood",
    "momentum",
    "friction",
    "used_guide",
    "session_outcome",
    "return_intent",
    "notes",
  ],
  franchiseMaster: [
    "entry_id",
    "collection_id",
    "series",
    "release_order",
    "release_year",
    "title",
    "entry_type",
    "parent_title",
    "lifecycle_status",
    "mapped_game_id",
    "notes",
  ],
  franchiseProgress: [
    "progress_id",
    "entry_id",
    "collection_id",
    "series",
    "title",
    "mapped_game_id",
    "user_status",
    "user_bucket",
    "notes",
  ],
  franchiseCovers: [
    "asset_id",
    "entry_id",
    "collection_id",
    "series",
    "title",
    "source_type",
    "source_ref",
    "cover_path",
    "resolved_image_url",
    "download_status",
    "notes",
  ],
  gameCovers: [
    "asset_id",
    "game_id",
    "title",
    "source_type",
    "source_ref",
    "cover_path",
    "resolved_image_url",
    "download_status",
    "notes",
  ],
} as const;

export type DatasetKey = keyof typeof DATA_FILES;
export type GuideUsage = "" | "none" | "some" | "heavy";
export type ReturnIntent = "" | "immediate" | "soon" | "later" | "unsure";
export type SessionOutcome =
  | ""
  | "good_session"
  | "mixed_session"
  | "stalled"
  | "stopped";
export type AppTab = "today" | "collections" | "library" | "patterns";
export type SortKey =
  | "priority"
  | "title"
  | "overall"
  | "fit"
  | "updated"
  | "watch"
  | "trap";
export type CollectionRailKind =
  | "game"
  | "franchise"
  | "franchise_entry";

export interface ProfileRow {
  preference_id: string;
  category: string;
  key: string;
  value: string;
  weight: string;
  confidence: string;
  evidence: string;
  last_updated: string;
}

export interface CatalogRow {
  game_id: string;
  title: string;
  series: string;
  primary_genre: string;
  combat_style: string;
  story_strength: Level;
  progression_clarity: Level;
  early_hook: Level;
  aesthetic_fit: Level;
  emotional_complexity: Level;
  combat_depth: Level;
  endgame_repetition_risk: Level;
  pacing_speed: Pace;
  notes: string;
}

export interface UpcomingReleaseRow {
  release_id: string;
  game_id: string;
  title: string;
  series: string;
  platforms: string;
  sort_date: string;
  release_label: string;
  primary_genre: string;
  combat_style: string;
  story_strength: Level;
  progression_clarity: Level;
  early_hook: Level;
  aesthetic_fit: Level;
  emotional_complexity: Level;
  combat_depth: Level;
  endgame_repetition_risk: Level;
  pacing_speed: Pace;
  source_ref: string;
  notes: string;
}

export interface PlatformRow {
  platform_id: string;
  display_name: string;
  family: string;
  vendor: string;
  generation: string;
  kind: string;
  sort_order: string;
  active_status: string;
  notes: string;
}

export interface UserPlatformAccessRow {
  access_id: string;
  platform_id: string;
  access_status: string;
  device_label: string;
  notes: string;
}

export interface GamePlatformRow {
  mapping_id: string;
  game_id: string;
  platform_id: string;
  availability_status: string;
  source_type: string;
  source_ref: string;
  notes: string;
}

export interface UpcomingReleasePlatformRow {
  release_platform_id: string;
  release_id: string;
  platform_id: string;
  sort_date: string;
  release_label: string;
  source_ref: string;
  notes: string;
}

export interface OpinionRow {
  opinion_id: string;
  game_id: string;
  title: string;
  status: string;
  hours_played: string;
  overall_score: string;
  story_score: string;
  progression_score: string;
  hook_score: string;
  aesthetic_score: string;
  emotional_complexity_score: string;
  combat_depth_score: string;
  endgame_repetition_penalty: string;
  pacing_score: string;
  narrative_payoff_score: string;
  confidence: string;
  notes: string;
  last_updated: string;
  completion_mode?: string;
  guide_usage?: string;
  cheats_used?: string;
  difficulty_mode?: string;
  drop_reason_tags?: string;
  purchase_interest?: string;
  price_ceiling_usd?: string;
}

export interface RecommendationRow {
  recommendation_id: string;
  game_id: string;
  title: string;
  recommended_on: string;
  recommendation_type: string;
  fit_estimate: string;
  status: string;
  reason: string;
  user_feedback: string;
  next_action: string;
}

export interface SessionCheckinRow {
  checkin_id: string;
  game_id: string;
  title: string;
  checkin_date: string;
  mood: string;
  momentum: Level;
  friction: Level;
  used_guide: GuideUsage;
  session_outcome: SessionOutcome;
  return_intent: ReturnIntent;
  notes: string;
}

export interface FranchiseMasterRow {
  entry_id: string;
  collection_id: string;
  series: string;
  release_order: string;
  release_year: string;
  title: string;
  entry_type: string;
  parent_title: string;
  lifecycle_status: string;
  mapped_game_id: string;
  notes: string;
}

export interface FranchiseProgressRow {
  progress_id: string;
  entry_id: string;
  collection_id: string;
  series: string;
  title: string;
  mapped_game_id: string;
  user_status: string;
  user_bucket: string;
  notes: string;
}

export interface FranchiseCoverRow {
  asset_id: string;
  entry_id: string;
  collection_id: string;
  series: string;
  title: string;
  source_type: string;
  source_ref: string;
  cover_path: string;
  resolved_image_url: string;
  download_status: string;
  notes: string;
}

export interface GameCoverRow {
  asset_id: string;
  game_id: string;
  title: string;
  source_type: string;
  source_ref: string;
  cover_path: string;
  resolved_image_url: string;
  download_status: string;
  notes: string;
}

export interface RawData {
  profile: ProfileRow[];
  catalog: CatalogRow[];
  upcomingReleases: UpcomingReleaseRow[];
  platforms: PlatformRow[];
  userPlatformAccess: UserPlatformAccessRow[];
  gamePlatforms: GamePlatformRow[];
  upcomingReleasePlatforms: UpcomingReleasePlatformRow[];
  opinions: OpinionRow[];
  recommendations: RecommendationRow[];
  checkins: SessionCheckinRow[];
  franchiseMaster: FranchiseMasterRow[];
  franchiseProgress: FranchiseProgressRow[];
  franchiseCovers: FranchiseCoverRow[];
  gameCovers: GameCoverRow[];
}

export interface BaseGameRecord {
  gameId: string;
  title: string;
  series: string;
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
  catalogNotes: string;
  coverPath: string;
  opinion?: OpinionRow;
  recommendation?: RecommendationRow;
  status: string;
  overallScore?: number;
  storyScore?: number;
  progressionScore?: number;
  hookScore?: number;
  aestheticScore?: number;
  emotionalScore?: number;
  combatScore?: number;
  repetitionPenalty?: number;
  pacingScore?: number;
  payoffScore?: number;
  fitEstimate?: number;
  checkins: SessionCheckinRow[];
  latestCheckin?: SessionCheckinRow;
  sessionCount: number;
  currentMood: string;
  currentMomentum: Level;
  currentFriction: Level;
  currentGuideUsage: GuideUsage;
  currentSessionOutcome: SessionOutcome;
  currentReturnIntent: ReturnIntent;
  lastSessionDate: string;
  lastTouched: string;
}

export interface GameRecord extends BaseGameRecord {
  matchedTraits: string[];
  profileMatchScore: number;
  backlogPriorityScore: number;
  trapRiskScore: number;
  watchRiskScore: number;
  profileMatchReasons: string[];
  backlogPriorityReasons: string[];
  trapRiskReasons: string[];
  watchRiskReasons: string[];
  decisionSummary: string;
  recommendedAction: string;
}

export interface UpcomingReleaseRecord {
  releaseId: string;
  gameId: string;
  title: string;
  series: string;
  platforms: string;
  sortDate: string;
  releaseLabel: string;
  sourceRef: string;
  notes: string;
  predictedFitScore: number;
  fitTier: "high" | "medium" | "low";
  fitReasons: string[];
  trackedUniverse: boolean;
  availableToUser: boolean;
}

export interface FranchiseEntryRecord {
  entryId: string;
  collectionId: string;
  series: string;
  releaseOrder: number;
  releaseYear: string;
  title: string;
  entryType: string;
  parentTitle: string;
  lifecycleStatus: string;
  mappedGameId: string;
  notes: string;
  coverPath: string;
  progress?: FranchiseProgressRow;
  gameRecord?: GameRecord;
  userStatus: string;
  userBucket: string;
}

export interface FranchiseCollection {
  collectionId: string;
  series: string;
  entryCount: number;
  playedCount: number;
  completedCount: number;
  resumeCount: number;
  cautionCount: number;
  progressPercent: number;
  affinityScore: number;
  entries: FranchiseEntryRecord[];
  currentEntry?: FranchiseEntryRecord;
  nextEntry?: FranchiseEntryRecord;
  latestPlayedEntry?: FranchiseEntryRecord;
  coverPath: string;
}

export interface CollectionRailItem {
  key: string;
  railId: string;
  kind: CollectionRailKind;
  title: string;
  subtitle: string;
  coverPath: string;
  badge: string;
  tone: "neutral" | "success" | "warning" | "danger";
  meta: string;
  detail: string;
  collectionId?: string;
  entryId?: string;
  gameId?: string;
  record?: GameRecord;
  entry?: FranchiseEntryRecord;
  collection?: FranchiseCollection;
}

export interface CollectionRail {
  id: string;
  title: string;
  description: string;
  kind: CollectionRailKind;
  items: CollectionRailItem[];
}

export interface AppData extends RawData {
  records: GameRecord[];
  upcomingReleaseRecords: UpcomingReleaseRecord[];
  collections: FranchiseCollection[];
  collectionRails: CollectionRail[];
  franchiseShelves: CollectionRail[];
}
