export const TASTE_SECTIONS = ["dna", "map", "activity"] as const;
export type TasteSection = (typeof TASTE_SECTIONS)[number];

export function parseTasteSection(value: string | undefined): TasteSection {
  return TASTE_SECTIONS.find((section) => section === value) ?? "dna";
}

export function tasteSectionHref(section: TasteSection) {
  return `/taste?section=${section}`;
}
