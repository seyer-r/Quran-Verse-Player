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
  | "mosque"
  // Live video backgrounds (web: HTML5 video; native: expo-video)
  | "rain"
  | "waves"
  | "dunes"
  | "embers"
  | "galaxy";

export interface BackgroundOption {
  id: BackgroundId;
  label: string;
  // require()'d local asset, or null for "none" / video backgrounds.
  source: number | null;
  /**
   * CDN URL of a short looping MP4 used as a live video background.
   * When set, the player renders a muted looping <video> instead of a
   * static Image. `source` must be null for these entries.
   */
  videoUrl?: string;
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

  // ── Live video backgrounds ──────────────────────────────────────────────
  // All sourced from Mixkit (free stock video CDN, no attribution required).
  // Short loops, streamed on demand — zero impact on app bundle size.
  {
    id: "rain",
    label: "Rain",
    source: null,
    videoUrl:
      "https://assets.mixkit.co/videos/preview/mixkit-rain-falling-on-the-surface-of-a-lake-18312-large.mp4",
  },
  {
    id: "waves",
    label: "Waves",
    source: null,
    videoUrl:
      "https://assets.mixkit.co/videos/preview/mixkit-ocean-waves-hitting-the-beach-shore-1024-large.mp4",
  },
  {
    id: "dunes",
    label: "Dunes",
    source: null,
    videoUrl:
      "https://assets.mixkit.co/videos/preview/mixkit-sand-dunes-with-dry-wind-4808-large.mp4",
  },
  {
    id: "embers",
    label: "Embers",
    source: null,
    videoUrl:
      "https://assets.mixkit.co/videos/preview/mixkit-campfire-at-night-in-the-forest-24601-large.mp4",
  },
  {
    id: "galaxy",
    label: "Galaxy",
    source: null,
    videoUrl:
      "https://assets.mixkit.co/videos/preview/mixkit-stars-in-night-sky-1167-large.mp4",
  },
];

export const DEFAULT_BACKGROUND: BackgroundId = "none";

export const getBackground = (id: BackgroundId): BackgroundOption =>
  BACKGROUND_OPTIONS.find((o) => o.id === id) ?? BACKGROUND_OPTIONS[0];
