// Background scenes — pure-black "None" by default plus four cinematic
// nature scenes. Each background is dimmed under a vertical scrim so the
// Arabic text always remains legible.

export type BackgroundId = "none" | "mountains" | "ocean" | "forest" | "stars";

export interface BackgroundOption {
  id: BackgroundId;
  label: string;
  // require()'d local asset, or null for "none" (pure black).
  source: number | null;
}

export const BACKGROUND_OPTIONS: BackgroundOption[] = [
  { id: "none", label: "None", source: null },
  {
    id: "mountains",
    label: "Mountains",
    source: require("../assets/images/bg-mountains.png"),
  },
  {
    id: "ocean",
    label: "Ocean",
    source: require("../assets/images/bg-ocean.png"),
  },
  {
    id: "forest",
    label: "Forest",
    source: require("../assets/images/bg-forest.png"),
  },
  {
    id: "stars",
    label: "Stars",
    source: require("../assets/images/bg-stars.png"),
  },
];

export const DEFAULT_BACKGROUND: BackgroundId = "none";

export const getBackground = (id: BackgroundId): BackgroundOption =>
  BACKGROUND_OPTIONS.find((o) => o.id === id) ?? BACKGROUND_OPTIONS[0];
