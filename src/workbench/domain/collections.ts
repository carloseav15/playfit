import type {
  CollectionRail,
  CollectionRailItem,
  FranchiseCollection,
  FranchiseCoverRow,
  FranchiseEntryRecord,
  FranchiseMasterRow,
  FranchiseProgressRow,
  GameCoverRow,
  GameRecord,
} from "../data/schema";

const MIXED_RAIL_LIMIT = 10;

function toNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function humanizeValue(value: string) {
  if (!value) {
    return "";
  }

  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function statusTone(status: string): CollectionRailItem["tone"] {
  if (["completed", "playing"].includes(status)) return "success";
  if (
    ["on_hold", "backlog", "interested_not_started", "open", "catalog_only"].includes(
      status,
    )
  ) {
    return "warning";
  }
  if (["dropped", "dropped_then_watched", "bounced"].includes(status)) {
    return "danger";
  }

  return "neutral";
}

function bucketTone(bucket: string): CollectionRailItem["tone"] {
  if (bucket === "played") return "success";
  if (["resume", "next"].includes(bucket)) return "warning";
  if (bucket === "caution") return "danger";
  return "neutral";
}

function buildCollectionAffinity(entry: FranchiseEntryRecord) {
  if (entry.userBucket === "played") {
    return 3;
  }
  if (entry.userBucket === "resume" || ["playing", "on_hold"].includes(entry.userStatus)) {
    return 2;
  }
  if (entry.userBucket === "next" || entry.userStatus === "interested_not_started") {
    return 1;
  }
  if (entry.userBucket === "caution" || entry.userStatus === "bounced") {
    return -2;
  }
  return 0;
}

function collectionSummary(collection: FranchiseCollection) {
  if (collection.currentEntry) {
    return `Current run is ${collection.currentEntry.title}.`;
  }

  if (collection.nextEntry) {
    return `Next chronology step is ${collection.nextEntry.title}.`;
  }

  return "Tracked franchise with no clear next step yet.";
}

function buildFranchiseRailItem(
  railId: string,
  collection: FranchiseCollection,
): CollectionRailItem {
  return {
    key: `${railId}:${collection.collectionId}`,
    railId,
    kind: "franchise",
    title: collection.series,
    subtitle: `${collection.entryCount} entries`,
    coverPath: collection.coverPath,
    badge: `${collection.progressPercent}% tracked`,
    tone:
      collection.affinityScore >= 10
        ? "success"
        : collection.affinityScore >= 3
          ? "warning"
          : "neutral",
    meta: `${collection.playedCount} played • ${collection.resumeCount} to resume`,
    detail: collectionSummary(collection),
    collectionId: collection.collectionId,
    collection,
  };
}

function buildEntryRailItem(
  railId: string,
  entry: FranchiseEntryRecord,
  collection: FranchiseCollection,
): CollectionRailItem {
  const badge = entry.userStatus
    ? humanizeValue(entry.userStatus)
    : entry.lifecycleStatus === "upcoming"
      ? "Upcoming"
      : "";
  const isShelfRail = railId.startsWith("franchise-shelf:");
  const subtitle = isShelfRail ? "" : collection.series;
  const entryType = humanizeValue(entry.entryType);
  const metaSegments = isShelfRail
    ? [entry.releaseYear || "TBD", entry.entryType !== "mainline" ? entryType : ""].filter(
        Boolean,
      )
    : [entry.releaseYear || "TBD", entryType].filter(Boolean);

  return {
    key: `${railId}:${entry.entryId}`,
    railId,
    kind: "franchise_entry",
    title: entry.title,
    subtitle,
    coverPath: entry.coverPath || entry.gameRecord?.coverPath || "",
    badge,
    tone: bucketTone(entry.userBucket || entry.userStatus),
    meta: metaSegments.join(" • "),
    detail:
      entry.notes ||
      (entry.lifecycleStatus === "upcoming"
        ? "Upcoming entry in a tracked universe."
        : `Franchise chronology slot ${entry.releaseOrder}.`),
    collectionId: collection.collectionId,
    entryId: entry.entryId,
    gameId: entry.mappedGameId || undefined,
    record: entry.gameRecord,
    entry,
    collection,
  };
}

function normalizeComparableLabel(value: string) {
  return value.trim().toLocaleLowerCase();
}

function buildGameRailItem(
  railId: string,
  record: GameRecord,
  trackedSeriesByGameId: Map<string, string>,
): CollectionRailItem {
  const trackedSeries = trackedSeriesByGameId.get(record.gameId) ?? "";
  const subtitle =
    trackedSeries &&
    normalizeComparableLabel(trackedSeries) !== normalizeComparableLabel(record.title)
      ? trackedSeries
      : "";
  const meta = humanizeValue(record.primaryGenre);

  return {
    key: `${railId}:${record.gameId}`,
    railId,
    kind: "game",
    title: record.title,
    subtitle,
    coverPath: record.coverPath,
    badge: humanizeValue(record.status),
    tone: statusTone(record.status),
    meta,
    detail: record.recommendedAction || record.decisionSummary,
    gameId: record.gameId,
    record,
  };
}

function sortCollections(collections: FranchiseCollection[]) {
  return [...collections].sort((left, right) => {
    if (right.affinityScore !== left.affinityScore) {
      return right.affinityScore - left.affinityScore;
    }

    return left.series.localeCompare(right.series);
  });
}

export function buildCollectionsModel(
  records: GameRecord[],
  franchiseMaster: FranchiseMasterRow[],
  franchiseProgress: FranchiseProgressRow[],
  franchiseCovers: FranchiseCoverRow[],
  gameCovers: GameCoverRow[],
) {
  const recordsById = new Map(records.map((record) => [record.gameId, record]));
  const progressByEntryId = new Map(
    franchiseProgress.map((row) => [row.entry_id, row]),
  );
  const entryCoverById = new Map<string, string>();
  franchiseCovers.forEach((row) => {
    if (row.cover_path) {
      entryCoverById.set(row.entry_id, row.cover_path);
    }
  });

  const gameCoverById = new Map<string, string>();
  gameCovers.forEach((row) => {
    if (row.cover_path) {
      gameCoverById.set(row.game_id, row.cover_path);
    }
  });

  const grouped = new Map<string, FranchiseMasterRow[]>();
  const trackedSeriesByGameId = new Map<string, string>();
  franchiseMaster.forEach((row) => {
    const existing = grouped.get(row.collection_id) ?? [];
    existing.push(row);
    grouped.set(row.collection_id, existing);

    if (row.mapped_game_id && !trackedSeriesByGameId.has(row.mapped_game_id)) {
      trackedSeriesByGameId.set(row.mapped_game_id, row.series);
    }
  });

  const collections = sortCollections(
    [...grouped.entries()].map(([collectionId, rows]) => {
      const orderedRows = [...rows].sort(
        (left, right) => toNumber(left.release_order) - toNumber(right.release_order),
      );

      const entries = orderedRows.map((row) => {
        const progress = progressByEntryId.get(row.entry_id);
        const gameRecord = row.mapped_game_id
          ? recordsById.get(row.mapped_game_id)
          : undefined;

        const entry: FranchiseEntryRecord = {
          entryId: row.entry_id,
          collectionId,
          series: row.series,
          releaseOrder: toNumber(row.release_order),
          releaseYear: row.release_year,
          title: row.title,
          entryType: row.entry_type,
          parentTitle: row.parent_title,
          lifecycleStatus: row.lifecycle_status,
          mappedGameId: row.mapped_game_id,
          notes: row.notes,
          coverPath:
            entryCoverById.get(row.entry_id) ||
            (row.mapped_game_id ? gameCoverById.get(row.mapped_game_id) : "") ||
            gameRecord?.coverPath ||
            "",
          progress,
          gameRecord,
          userStatus: progress?.user_status ?? "",
          userBucket: progress?.user_bucket ?? "",
        };

        return entry;
      });

      const currentEntry =
        entries.find((entry) => entry.userStatus === "playing") ??
        entries.find((entry) => entry.userStatus === "on_hold");
      const unreachedReleased = entries.find(
        (entry) => entry.lifecycleStatus === "released" && !entry.progress,
      );
      const upcomingEntry = entries.find(
        (entry) => entry.lifecycleStatus === "upcoming" && !entry.progress,
      );
      const latestPlayedEntry = [...entries]
        .reverse()
        .find((entry) => entry.progress && entry.userBucket !== "next");

      const playedCount = entries.filter((entry) => entry.userBucket === "played").length;
      const completedCount = entries.filter(
        (entry) => entry.userStatus === "completed",
      ).length;
      const resumeCount = entries.filter(
        (entry) =>
          entry.userBucket === "resume" ||
          ["playing", "on_hold"].includes(entry.userStatus),
      ).length;
      const cautionCount = entries.filter(
        (entry) => entry.userBucket === "caution",
      ).length;
      const progressCount = entries.filter((entry) => entry.progress).length;

      const collection: FranchiseCollection = {
        collectionId,
        series: orderedRows[0]?.series ?? collectionId,
        entryCount: entries.length,
        playedCount,
        completedCount,
        resumeCount,
        cautionCount,
        progressPercent:
          entries.length > 0
            ? Math.round((progressCount / entries.length) * 100)
            : 0,
        affinityScore: entries.reduce(
          (score, entry) => score + buildCollectionAffinity(entry),
          0,
        ),
        entries,
        currentEntry,
        nextEntry: currentEntry ?? unreachedReleased ?? upcomingEntry,
        latestPlayedEntry,
        coverPath:
          currentEntry?.coverPath ||
          latestPlayedEntry?.coverPath ||
          unreachedReleased?.coverPath ||
          upcomingEntry?.coverPath ||
          entries.find((entry) => entry.coverPath)?.coverPath ||
          "",
      };

      return collection;
    }),
  );

  const continueRuns: CollectionRail = {
    id: "continue-runs",
    title: "Continue your runs",
    description: "Active and paused games that already have momentum.",
    kind: "game",
    items: [...records]
      .filter((record) => ["playing", "on_hold"].includes(record.status))
      .sort((left, right) => right.backlogPriorityScore - left.backlogPriorityScore)
      .slice(0, MIXED_RAIL_LIMIT)
      .map((record) => buildGameRailItem("continue-runs", record, trackedSeriesByGameId)),
  };

  const playNextInFranchise: CollectionRail = {
    id: "play-next-in-franchise",
    title: "Play next in a franchise",
    description: "The clearest next chronology steps across the worlds you follow.",
    kind: "franchise_entry",
    items: collections
      .filter((collection) => collection.nextEntry)
      .map((collection) =>
        buildEntryRailItem(
          "play-next-in-franchise",
          collection.nextEntry as FranchiseEntryRecord,
          collection,
        ),
      )
      .slice(0, MIXED_RAIL_LIMIT),
  };

  const bestFranchiseFits: CollectionRail = {
    id: "best-franchise-fits",
    title: "Best franchise fits",
    description: "Worlds that already map cleanly to your taste and history.",
    kind: "franchise",
    items: collections
      .slice(0, MIXED_RAIL_LIMIT)
      .map((collection) => buildFranchiseRailItem("best-franchise-fits", collection)),
  };

  const highRiskTemptations: CollectionRail = {
    id: "high-risk-temptations",
    title: "High-risk temptations",
    description: "Strong-looking picks with a real chance of stalling or turning into a watch.",
    kind: "game",
    items: [...records]
      .filter(
        (record) =>
          record.profileMatchScore >= 60 &&
          (record.watchRiskScore >= 60 || record.trapRiskScore >= 60),
      )
      .sort((left, right) => {
        const leftRisk = left.watchRiskScore + left.trapRiskScore + left.profileMatchScore;
        const rightRisk =
          right.watchRiskScore + right.trapRiskScore + right.profileMatchScore;
        return rightRisk - leftRisk;
      })
      .slice(0, MIXED_RAIL_LIMIT)
      .map((record) =>
        buildGameRailItem("high-risk-temptations", record, trackedSeriesByGameId),
      ),
  };

  const franchiseShelves = collections.map((collection) => ({
    id: `franchise-shelf:${collection.collectionId}`,
    title: collection.series,
    description: collectionSummary(collection),
    kind: "franchise_entry" as const,
    items: collection.entries.map((entry) =>
      buildEntryRailItem(`franchise-shelf:${collection.collectionId}`, entry, collection),
    ),
  }));

  return {
    collections,
    collectionRails: [
      continueRuns,
      playNextInFranchise,
      bestFranchiseFits,
      highRiskTemptations,
    ].filter((rail) => rail.items.length > 0),
    franchiseShelves,
  };
}
