import { describe, expect, it } from "vitest";
import type { ProductProfile } from "../types";
import {
  buildDislikedTagsFromProfile,
  buildLikedTagsFromProfile,
} from "./recommendation-profile-tags";

function createProfile(overrides: Partial<ProductProfile> = {}): ProductProfile {
  return {
    summary: "Profile",
    likedGenres: [],
    avoidedGenres: [],
    likedTags: { story_rich: 3, horror: 1, mixed: 2 },
    dislikedTags: { horror: 2, mixed: 2, demanding: 4 },
    ratedCount: 3,
    signals: [],
    ...overrides,
  };
}

describe("recommendation-profile-tags", () => {
  it("keeps only tags with stronger positive evidence", () => {
    expect(buildLikedTagsFromProfile(createProfile())).toEqual({ story_rich: 3 });
  });

  it("keeps only tags with stronger negative evidence", () => {
    expect(buildDislikedTagsFromProfile(createProfile())).toEqual({ horror: 2, demanding: 4 });
  });

  it("excludes tied evidence from both effective profiles", () => {
    const profile = createProfile({ likedTags: { shared: 2 }, dislikedTags: { shared: 2 } });

    expect(buildLikedTagsFromProfile(profile)).toEqual({});
    expect(buildDislikedTagsFromProfile(profile)).toEqual({});
  });
});
