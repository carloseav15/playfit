import type { ProductProfile } from "../types";

export function buildLikedTagsFromProfile(profile: ProductProfile) {
  return Object.fromEntries(
    Object.entries(profile.likedTags).filter(
      ([tag, count]) => count > (profile.dislikedTags[tag] ?? 0),
    ),
  );
}

export function buildDislikedTagsFromProfile(profile: ProductProfile) {
  return Object.fromEntries(
    Object.entries(profile.dislikedTags).filter(
      ([tag, count]) => count > (profile.likedTags[tag] ?? 0),
    ),
  );
}
