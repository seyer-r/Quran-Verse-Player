// Ambient soundscape options. Each track is bundled with the app so it
// works fully offline. Sources are CC0 / royalty-free recordings from
// mixkit.co's free SFX library.

export type AmbientId =
  | "off"
  | "rain"
  | "ocean"
  | "forest"
  | "night"
  | "wind";

export interface AmbientOption {
  id: AmbientId;
  label: string;
  // SF symbol for iOS — falls back to Feather on Android.
  sfSymbol: string;
  feather: string;
  // require()'d local asset, or null for "off".
  source: number | null;
}

export const AMBIENT_OPTIONS: AmbientOption[] = [
  {
    id: "off",
    label: "None",
    sfSymbol: "speaker.slash",
    feather: "volume-x",
    source: null,
  },
  {
    id: "rain",
    label: "Rain",
    sfSymbol: "cloud.rain",
    feather: "cloud-drizzle",
    source: require("../assets/sounds/rain.mp3"),
  },
  {
    id: "ocean",
    label: "Ocean",
    sfSymbol: "water.waves",
    feather: "anchor",
    source: require("../assets/sounds/ocean.mp3"),
  },
  {
    id: "forest",
    label: "Forest",
    sfSymbol: "leaf",
    feather: "feather",
    source: require("../assets/sounds/forest.mp3"),
  },
  {
    id: "night",
    label: "Night",
    sfSymbol: "moon.stars",
    feather: "moon",
    source: require("../assets/sounds/night.mp3"),
  },
  {
    id: "wind",
    label: "Wind",
    sfSymbol: "wind",
    feather: "wind",
    source: require("../assets/sounds/wind.mp3"),
  },
];

export const DEFAULT_AMBIENT: AmbientId = "off";
export const DEFAULT_AMBIENT_VOLUME = 0.5;

export const getAmbient = (id: AmbientId): AmbientOption =>
  AMBIENT_OPTIONS.find((o) => o.id === id) ?? AMBIENT_OPTIONS[0];
