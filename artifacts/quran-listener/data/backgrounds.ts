// Background scenes — pure-black "None" by default plus cinematic
// nature scenes. Each background is dimmed under a vertical scrim so the
// Arabic text always remains legible.

export type BackgroundId =
  | "none"
  | "mountains"
  | "ocean"
  | "forest"
  | "stars"
  | "desert"
  | "aurora"
  | "misty-mountains"
  | "milky-way"
  | "mosque";

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
  {
    id: "desert",
    label: "Desert",
    source: require("../assets/images/bg-desert.png"),
  },
  {
    id: "aurora",
    label: "Aurora",
    source: require("../assets/images/bg-aurora.png"),
  },
  {
    id: "misty-mountains",
    label: "Mist",
    source: require("../assets/images/bg-misty-mountains.png"),
  },
  {
    id: "milky-way",
    label: "Milky Way",
    source: require("../assets/images/bg-milky-way.png"),
  },
  {
    id: "mosque",
    label: "Mosque",
    source: require("../assets/images/bg-mosque.png"),
  },
];

export const DEFAULT_BACKGROUND: BackgroundId = "none";

export const getBackground = (id: BackgroundId): BackgroundOption =>
  BACKGROUND_OPTIONS.find((o) => o.id === id) ?? BACKGROUND_OPTIONS[0];
