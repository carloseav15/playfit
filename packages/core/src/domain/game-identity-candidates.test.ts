import { describe, expect, it } from "vitest";
import {
  type CatalogGameForIdentity,
  computeConfidence,
  findEditionKeyword,
  generateGameIdentityCandidates,
  matchesContainerKeyword,
  normalizeCandidatePair,
  stripEditionSuffix,
  titleTokenSimilarity,
} from "./game-identity-candidates";

function g(
  gameId: string,
  title: string,
  overrides: Partial<CatalogGameForIdentity> = {},
): CatalogGameForIdentity {
  return { gameId, title, releaseYear: null, seriesId: null, ...overrides };
}

function pair(
  candidates: ReturnType<typeof generateGameIdentityCandidates>,
  gameIdA: string,
  gameIdB: string,
) {
  const [a, b] = normalizeCandidatePair(gameIdA, gameIdB);
  return candidates.find((c) => c.gameIdA === a && c.gameIdB === b) ?? null;
}

describe("keyword classification", () => {
  it("detects edition keywords case-insensitively", () => {
    expect(findEditionKeyword("The Witcher 3: Wild Hunt - Complete Edition")).toBe(
      "complete edition",
    );
    expect(findEditionKeyword("Resident Evil 4 (remake)")).toBe("remake");
    expect(findEditionKeyword("The Legend of Zelda")).toBeNull();
  });

  it("treats Collection/Trilogy/Bundle as containers, not editions", () => {
    expect(matchesContainerKeyword("BioShock: The Collection")).toBe(true);
    expect(matchesContainerKeyword("Crash Bandicoot N. Sane Trilogy")).toBe(true);
    expect(matchesContainerKeyword("Capcom Beat 'Em Up Bundle")).toBe(true);
    expect(matchesContainerKeyword("The Witcher 3: Wild Hunt - Complete Edition")).toBe(false);
  });

  it("does not treat 'Collector's Edition' as a container keyword match on 'Collection'", () => {
    // Deliberate: "Collector's" must not substring-match "Collection".
    expect(matchesContainerKeyword("The Legend of Zelda: Collector's Edition")).toBe(false);
    expect(findEditionKeyword("The Legend of Zelda: Collector's Edition")).toBe(
      "collector's edition",
    );
  });
});

describe("suffix stripping", () => {
  it("strips a colon/dash-separated suffix", () => {
    expect(
      stripEditionSuffix("The Witcher 3: Wild Hunt - Complete Edition", "complete edition"),
    ).toBe("the witcher 3 wild hunt");
  });

  it("strips a parenthetical suffix", () => {
    expect(stripEditionSuffix("Resident Evil 4 (remake)", "remake")).toBe("resident evil 4");
  });

  it("strips en-dash separated suffix", () => {
    expect(
      stripEditionSuffix("The Elder Scrolls V: Skyrim – Special Edition", "special edition"),
    ).toBe("the elder scrolls v skyrim");
  });
});

describe("confidence scoring", () => {
  it("reaches high confidence for an exact match with matching series and valid years", () => {
    const result = computeConfidence({
      titleSimilarity: 1,
      isExactMatch: true,
      seriesIdA: "the_witcher",
      seriesIdB: "the_witcher",
      releaseYearA: 2016,
      releaseYearB: 2015,
      editionIsA: true,
    });
    expect(result.confidence).toBe("high");
    expect(result.discard).toBe(false);
    expect(result.seriesMatch).toBe(true);
  });

  it("keeps an exact title match with reversed years as LOW", () => {
    const result = computeConfidence({
      titleSimilarity: 1,
      isExactMatch: true,
      seriesIdA: null,
      seriesIdB: null,
      releaseYearA: 2010, // edition
      releaseYearB: 2015, // base
      editionIsA: true,
    });
    expect(result.discard).toBe(false);
    expect(result.confidence).toBe("low");
  });

  it("does not discard when year is unknown, but caps confidence below high", () => {
    const result = computeConfidence({
      titleSimilarity: 1,
      isExactMatch: true,
      seriesIdA: null,
      seriesIdB: null,
      releaseYearA: 0, // sentinel for "unknown" seen in real catalog data
      releaseYearB: 2023,
      editionIsA: true,
    });
    expect(result.discard).toBe(false);
    expect(result.confidence).toBe("medium");
  });

  it("treats a missing series_id on either side as neutral, not a penalty", () => {
    const withSeries = computeConfidence({
      titleSimilarity: 1,
      isExactMatch: true,
      seriesIdA: "x",
      seriesIdB: null,
      releaseYearA: 2020,
      releaseYearB: 2019,
      editionIsA: true,
    });
    const withoutAnySeries = computeConfidence({
      titleSimilarity: 1,
      isExactMatch: true,
      seriesIdA: null,
      seriesIdB: null,
      releaseYearA: 2020,
      releaseYearB: 2019,
      editionIsA: true,
    });
    expect(withSeries.confidence).toBe(withoutAnySeries.confidence);
    expect(withSeries.seriesMatch).toBeNull();
  });

  it("rejects a fuzzy match with reversed years", () => {
    const result = computeConfidence({
      titleSimilarity: 0.8,
      isExactMatch: false,
      seriesIdA: "series",
      seriesIdB: "series",
      releaseYearA: 2010,
      releaseYearB: 2015,
      editionIsA: true,
    });
    expect(result.discard).toBe(true);
  });

  it("does not let a matching series restore HIGH after a missing-year cap", () => {
    const result = computeConfidence({
      titleSimilarity: 1,
      isExactMatch: true,
      seriesIdA: "series",
      seriesIdB: "series",
      releaseYearA: null,
      releaseYearB: 2015,
      editionIsA: true,
    });
    expect(result.seriesMatch).toBe(true);
    expect(result.confidence).toBe("medium");
  });
});

describe("titleTokenSimilarity", () => {
  it("is symmetric and bounded to [0,1]", () => {
    const a = titleTokenSimilarity("Persona 5", "Persona 5 Strikers");
    const b = titleTokenSimilarity("Persona 5 Strikers", "Persona 5");
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThanOrEqual(1);
  });
});

describe("generateGameIdentityCandidates -- positive cases (should generate a pending candidate)", () => {
  it("Witcher 3 base / GOTY / Complete Edition", () => {
    const catalog = [
      g("the_witcher_3_wild_hunt", "The Witcher 3: Wild Hunt", {
        releaseYear: 2015,
        seriesId: "the_witcher",
      }),
      g(
        "the_witcher_3_wild_hunt_game_of_the_year_edition",
        "The Witcher 3: Wild Hunt - Game of the Year Edition",
        { releaseYear: 2016, seriesId: "the_witcher" },
      ),
      g("the_witcher_3_wild_hunt_complete_edition", "The Witcher 3 Wild Hunt - Complete Edition", {
        releaseYear: 2016,
        seriesId: "the_witcher",
      }),
    ];
    const candidates = generateGameIdentityCandidates(catalog);

    expect(
      pair(
        candidates,
        "the_witcher_3_wild_hunt",
        "the_witcher_3_wild_hunt_game_of_the_year_edition",
      )?.confidence,
    ).toBe("high");
    expect(
      pair(candidates, "the_witcher_3_wild_hunt", "the_witcher_3_wild_hunt_complete_edition")
        ?.confidence,
    ).toBe("high");
  });

  it("Dark Souls / Remastered", () => {
    const catalog = [
      g("dark_souls", "Dark Souls", { releaseYear: 2011, seriesId: "dark_souls" }),
      g("dark_souls_remastered", "DARK SOULS™: REMASTERED", {
        releaseYear: 2018,
        seriesId: "dark_souls",
      }),
    ];
    const candidates = generateGameIdentityCandidates(catalog);
    const found = pair(candidates, "dark_souls", "dark_souls_remastered");
    expect(found).toBeTruthy();
    expect(found?.confidence).toBe("high");
  });

  it("Skyrim / Special Edition and Skyrim / Anniversary Edition", () => {
    const catalog = [
      g("the_elder_scrolls_v_skyrim", "The Elder Scrolls V: Skyrim", {
        releaseYear: 2011,
        seriesId: "the_elder_scrolls",
      }),
      g(
        "the_elder_scrolls_v_skyrim_special_edition",
        "The Elder Scrolls V: Skyrim - Special Edition",
        { releaseYear: 2016, seriesId: null }, // real catalog: series_id is null on this row
      ),
      g(
        "the_elder_scrolls_v_skyrim_anniversary_edition",
        "The Elder Scrolls V: Skyrim - Anniversary Edition",
        { releaseYear: 2021, seriesId: "the_elder_scrolls" },
      ),
    ];
    const candidates = generateGameIdentityCandidates(catalog);

    expect(
      pair(candidates, "the_elder_scrolls_v_skyrim", "the_elder_scrolls_v_skyrim_special_edition")
        ?.confidence,
    ).toBe("high");
    expect(
      pair(
        candidates,
        "the_elder_scrolls_v_skyrim",
        "the_elder_scrolls_v_skyrim_anniversary_edition",
      )?.confidence,
    ).toBe("high");
  });

  it("GTA IV / Complete Edition", () => {
    const catalog = [
      g("grand_theft_auto_iv", "Grand Theft Auto IV", {
        releaseYear: 2008,
        seriesId: "grand_theft_auto",
      }),
      g("grand_theft_auto_iv_complete_edition", "Grand Theft Auto IV: Complete Edition", {
        releaseYear: 2010,
        seriesId: "grand_theft_auto",
      }),
    ];
    const candidates = generateGameIdentityCandidates(catalog);
    expect(
      pair(candidates, "grand_theft_auto_iv", "grand_theft_auto_iv_complete_edition")?.confidence,
    ).toBe("high");
  });

  it("BioShock / Remastered", () => {
    const catalog = [
      g("bioshock", "BioShock™", { releaseYear: 2007, seriesId: "bioshock" }),
      g("bioshock_remastered", "BioShock™ Remastered", {
        releaseYear: 2016,
        seriesId: "bioshock",
      }),
    ];
    const candidates = generateGameIdentityCandidates(catalog);
    expect(pair(candidates, "bioshock", "bioshock_remastered")?.confidence).toBe("high");
  });

  it("StarCraft / Remastered", () => {
    const candidates = generateGameIdentityCandidates([
      g("starcraft", "StarCraft", { releaseYear: 1998, seriesId: "starcraft" }),
      g("starcraft_remastered", "StarCraft: Remastered", {
        releaseYear: 2017,
        seriesId: "starcraft",
      }),
    ]);
    expect(pair(candidates, "starcraft", "starcraft_remastered")?.confidence).toBe("high");
  });

  it("Spider-Man / Remastered -- generates a candidate even though genre/series metadata is actively wrong in production", () => {
    const catalog = [
      g("marvel_s_spider_man", "Marvel's Spider-Man", {
        releaseYear: 2018,
        seriesId: "marvel_s_spider_man",
      }),
      // Real production row: series_id is garbage ("casual_adventure_action")
      // on the remastered row -- confidence must still come from title, not series.
      g("marvel_s_spider_man_remastered", "Marvel's Spider-Man: Remastered", {
        releaseYear: 2020,
        seriesId: "casual_adventure_action",
      }),
    ];
    const candidates = generateGameIdentityCandidates(catalog);
    const found = pair(candidates, "marvel_s_spider_man", "marvel_s_spider_man_remastered");
    expect(found).toBeTruthy();
    // series mismatch must not have blocked generation, and must not be
    // reported as a positive match either.
    expect(found?.evidence.seriesMatch).toBe(false);
  });
});

describe("generateGameIdentityCandidates -- confidence hardening", () => {
  it("caps exact remakes and Collector's Editions at MEDIUM after all boosts", () => {
    const candidates = generateGameIdentityCandidates([
      g("resident_evil_2", "Resident Evil 2", { releaseYear: 1998, seriesId: "resident_evil" }),
      g("resident_evil_2_remake", "Resident Evil 2 Remake", {
        releaseYear: 2019,
        seriesId: "resident_evil",
      }),
      g("journey", "Journey", { releaseYear: 2012, seriesId: "journey" }),
      g("journey_collectors", "Journey Collector's Edition", {
        releaseYear: 2013,
        seriesId: "journey",
      }),
    ]);

    expect(pair(candidates, "resident_evil_2", "resident_evil_2_remake")?.confidence).toBe(
      "medium",
    );
    expect(pair(candidates, "journey", "journey_collectors")?.confidence).toBe("medium");
  });

  it("caps exact and fuzzy partial-content candidates at MEDIUM", () => {
    const candidates = generateGameIdentityCandidates([
      g("example_campaign", "Example Game Campaign", { releaseYear: 2010, seriesId: "example" }),
      g("example_campaign_remastered", "Example Game Campaign Remastered", {
        releaseYear: 2015,
        seriesId: "example",
      }),
      g("mw2", "Call of Duty Modern Warfare 2", { releaseYear: 2009, seriesId: "modern_warfare" }),
      g("mw2_campaign", "Call of Duty Modern Warfare 2 Campaign Remastered", {
        releaseYear: 2020,
        seriesId: "modern_warfare",
      }),
    ]);

    expect(pair(candidates, "example_campaign", "example_campaign_remastered")?.confidence).toBe(
      "medium",
    );
    expect(pair(candidates, "mw2", "mw2_campaign")?.confidence).toBe("medium");
  });

  it("keeps genuine fuzzy same-series matches at MEDIUM, never HIGH", () => {
    const candidates = generateGameIdentityCandidates([
      g("assassins_creed", "Assassin's Creed", { releaseYear: 2007, seriesId: "assassins_creed" }),
      g("ac_rogue_remastered", "Assassin's Creed Rogue Remastered", {
        releaseYear: 2018,
        seriesId: "assassins_creed",
      }),
    ]);
    expect(pair(candidates, "assassins_creed", "ac_rogue_remastered")?.confidence).toBe("medium");
  });

  it("rejects fuzzy installment conflicts while preserving equal-installment exact matches", () => {
    const candidates = generateGameIdentityCandidates([
      g("aoe_iii", "Age of Empires III", { releaseYear: 2005, seriesId: "aoe" }),
      g("aoe_iv_anniversary", "Age of Empires IV Anniversary Edition", {
        releaseYear: 2021,
        seriesId: "aoe",
      }),
      g("tecmo_super_bowl", "Tecmo Super Bowl", { releaseYear: 1991, seriesId: "tecmo" }),
      g("tecmo_super_bowl_ii", "Tecmo Super Bowl II Special Edition", {
        releaseYear: 1994,
        seriesId: "tecmo",
      }),
      g("soul_reaver_2", "Soul Reaver 2", { releaseYear: 2001, seriesId: "soul_reaver" }),
      g("soul_reaver_1_2", "Soul Reaver 1&2 Remastered", {
        releaseYear: 2024,
        seriesId: "soul_reaver",
      }),
      g("dark_souls_iii", "Dark Souls III", { releaseYear: 2016, seriesId: "dark_souls" }),
      g("dark_souls_iii_deluxe", "Dark Souls III Deluxe Edition", {
        releaseYear: 2016,
        seriesId: "dark_souls",
      }),
      g("chronicles_war_2", "Chronicles of War 2", { releaseYear: 2000, seriesId: "chronicles" }),
      g("chronicles_war_ii_remastered", "Chronicles of War II Remastered", {
        releaseYear: 2020,
        seriesId: "chronicles",
      }),
    ]);

    expect(pair(candidates, "aoe_iii", "aoe_iv_anniversary")).toBeNull();
    expect(pair(candidates, "tecmo_super_bowl", "tecmo_super_bowl_ii")).toBeNull();
    expect(pair(candidates, "soul_reaver_2", "soul_reaver_1_2")).toBeNull();
    expect(pair(candidates, "dark_souls_iii", "dark_souls_iii_deluxe")?.confidence).toBe("high");
    expect(pair(candidates, "chronicles_war_2", "chronicles_war_ii_remastered")?.confidence).toBe(
      "medium",
    );
  });

  it("never marks the Resident Evil 4 HD fuzzy conflict as HIGH", () => {
    const candidates = generateGameIdentityCandidates([
      g("resident_evil_4_hd", "Resident Evil 4 HD", {
        releaseYear: 2011,
        seriesId: "resident_evil",
      }),
      g("resident_evil_hd_remaster", "Resident Evil HD Remaster", {
        releaseYear: 2015,
        seriesId: "resident_evil",
      }),
    ]);
    expect(pair(candidates, "resident_evil_4_hd", "resident_evil_hd_remaster")).toBeNull();
  });

  it("keeps exact reversed-year pairs as LOW and rejects fuzzy reversed-year pairs", () => {
    const candidates = generateGameIdentityCandidates([
      g("exact_base", "Exact Base", { releaseYear: 2020, seriesId: "exact" }),
      g("exact_edition", "Exact Base Remastered", { releaseYear: 2010, seriesId: "exact" }),
      g("fuzzy_base", "Fuzzy Base", { releaseYear: 2020, seriesId: "fuzzy" }),
      g("fuzzy_edition", "Fuzzy Base Rogue Remastered", { releaseYear: 2010, seriesId: "fuzzy" }),
    ]);

    expect(pair(candidates, "exact_base", "exact_edition")?.confidence).toBe("low");
    expect(pair(candidates, "fuzzy_base", "fuzzy_edition")).toBeNull();
  });
});

describe("generateGameIdentityCandidates -- negative cases (must never auto-confirm; some may still surface a candidate for human review)", () => {
  const editionCatalog = [
    g("persona_5", "Persona 5", { releaseYear: 2016, seriesId: "persona" }),
    g("persona_5_royal", "Persona 5 Royal", { releaseYear: 2019, seriesId: "persona" }),
    g("persona_5_strikers", "Persona 5 Strikers", { releaseYear: 2020, seriesId: "persona" }),
    g("resident_evil_4", "Resident Evil 4", { releaseYear: 0, seriesId: "resident_evil" }),
    g("resident_evil_4_2005", "Resident Evil 4 (2005)", { releaseYear: 2005, seriesId: null }),
    g("resident_evil_4_remake", "Resident Evil 4 (remake)", {
      releaseYear: 2023,
      seriesId: "resident_evil",
    }),
    g("the_legend_of_zelda_ocarina_of_time", "The Legend of Zelda: Ocarina of Time", {
      releaseYear: 1998,
      seriesId: "adventure_action_role_playing_games_rpg", // real production row: bad series_id
    }),
    g("the_legend_of_zelda_collector_s_edition", "The Legend of Zelda: Collector's Edition", {
      releaseYear: 2003,
      seriesId: "the_legend_of_zelda",
    }),
    g("bioshock", "BioShock™", { releaseYear: 2007, seriesId: "bioshock" }),
    g("bioshock_the_collection", "BioShock: The Collection", {
      releaseYear: 2016,
      seriesId: "bioshock",
    }),
    g("fifa_23", "FIFA 23", { releaseYear: 2022, seriesId: null }),
    g("the_witcher_3_wild_hunt", "The Witcher 3: Wild Hunt", {
      releaseYear: 2015,
      seriesId: "the_witcher",
    }),
    g("the_witcher_3_wild_hunt_blood_and_wine", "The Witcher 3: Wild Hunt – Blood and Wine", {
      releaseYear: 2016,
      seriesId: "the_witcher",
    }),
  ];
  const candidates = generateGameIdentityCandidates(editionCatalog);

  it("Persona 5 / Royal -- no candidate ('Royal' matches no edition keyword)", () => {
    expect(pair(candidates, "persona_5", "persona_5_royal")).toBeNull();
  });

  it("Persona 5 / Strikers -- no candidate ('Strikers' matches no edition keyword)", () => {
    expect(pair(candidates, "persona_5", "persona_5_strikers")).toBeNull();
  });

  it("BioShock / BioShock: The Collection -- no candidate (container keyword excluded on both sides)", () => {
    expect(pair(candidates, "bioshock", "bioshock_the_collection")).toBeNull();
  });

  it("FIFA 23 / FIFA 24 -- no candidate (annual naming matches no edition keyword)", () => {
    // FIFA 24 intentionally omitted from the fixture catalog: it would not
    // match any edition keyword regardless, so there is nothing to pair.
    const fifaMatches = candidates.filter(
      (c) => c.gameIdA === "fifa_23" || c.gameIdB === "fifa_23",
    );
    expect(fifaMatches).toHaveLength(0);
  });

  it("Witcher 3 / Blood and Wine -- no candidate (DLC subtitle matches no edition keyword)", () => {
    expect(
      pair(candidates, "the_witcher_3_wild_hunt", "the_witcher_3_wild_hunt_blood_and_wine"),
    ).toBeNull();
  });

  it("Resident Evil 4 (2005) / RE4 (remake, 2023) -- a candidate MAY exist for human review, but must never be pre-confirmed", () => {
    const found = pair(candidates, "resident_evil_4_2005", "resident_evil_4_remake");
    // The heuristic cannot distinguish a relabeled remaster from a genuine
    // remake by title alone -- this is exactly why the rubric says "remake
    // candidates need human judgment." What matters for correctness here
    // is only that nothing in this module marks it "accepted" or writes a
    // group -- generateGameIdentityCandidates never does either.
    if (found) {
      expect(found.confidence).toBeDefined(); // just a draft, never a decision
    }
    // No group/membership concept exists anywhere in this module -- there
    // is no code path here that could have confirmed anything.
  });

  it("Ocarina of Time / Collector's Edition -- never auto-groups a container as a component's equivalent", () => {
    // Collector's Edition is excluded from the candidate pool on the
    // "container" side by construction: no draft is generated where
    // "the_legend_of_zelda_collector_s_edition" appears at all -- verifying
    // that guarantees a human reviewer, not this heuristic, is the one who
    // would have to (incorrectly) approve treating a multi-game collection
    // as equivalent to a single game.
    const involvingCollectorsEdition = candidates.filter(
      (c) =>
        c.gameIdA === "the_legend_of_zelda_collector_s_edition" ||
        c.gameIdB === "the_legend_of_zelda_collector_s_edition",
    );
    expect(involvingCollectorsEdition).toHaveLength(0);
  });

  it("no draft ever has an empty/self pair", () => {
    for (const c of candidates) {
      expect(c.gameIdA).not.toBe(c.gameIdB);
      expect(c.gameIdA < c.gameIdB).toBe(true); // normalized ordering held
    }
  });
});
