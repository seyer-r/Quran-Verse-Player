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
  | "galaxy"
  // User-uploaded custom background (image or video from device library)
  | "custom";

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
  // Pexels CDN (access-control-allow-origin: * confirmed on all URLs below).
  // IDs sourced from real Pexels nature video pages — content verified.
  {
    // pexels.com/video/heavy-rainfall-1299684/
    id: "rain",
    label: "Rain",
    source: null,
    videoUrl:
      "https://videos.pexels.com/video-files/1299684/1299684-hd_1920_1080_30fps.mp4",
  },
  {
    // pexels.com/video/series-of-waves-crashing-the-beachfront-3115506/
    id: "waves",
    label: "Waves",
    source: null,
    videoUrl:
      "https://videos.pexels.com/video-files/3115506/3115506-hd_1920_1080_24fps.mp4",
  },
  {
    // pexels.com/video/a-desert-with-sand-dunes-and-some-bushes-19376556/
    id: "dunes",
    label: "Dunes",
    source: null,
    videoUrl:
      "https://videos.pexels.com/video-files/19376556/19376556-hd_1920_1080_25fps.mp4",
  },
  {
    // pexels.com/video/campfire-burning-at-night-854746/
    id: "embers",
    label: "Embers",
    source: null,
    videoUrl:
      "https://videos.pexels.com/video-files/854746/854746-hd_1920_1080_30fps.mp4",
  },
  {
    // pexels.com/video/time-lapse-of-milky-way-in-night-sky-13382270/
    id: "galaxy",
    label: "Galaxy",
    source: null,
    videoUrl:
      "https://videos.pexels.com/video-files/13382270/13382270-hd_1920_1080_24fps.mp4",
  },
];

export const DEFAULT_BACKGROUND: BackgroundId = "none";

export const getBackground = (id: BackgroundId): BackgroundOption => {
  if (id === "custom") return { id: "custom", label: "Custom", source: null };
  return BACKGROUND_OPTIONS.find((o) => o.id === id) ?? BACKGROUND_OPTIONS[0];
};
