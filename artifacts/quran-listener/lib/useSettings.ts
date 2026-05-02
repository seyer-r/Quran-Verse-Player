import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import {
  AMBIENT_OPTIONS,
  type AmbientId,
  DEFAULT_AMBIENT,
  DEFAULT_AMBIENT_VOLUME,
} from "@/data/ambient";
import {
  BACKGROUND_OPTIONS,
  type BackgroundId,
  DEFAULT_BACKGROUND,
} from "@/data/backgrounds";
import { getSurah, TOTAL_SURAHS } from "@/data/quran";
import {
  DEFAULT_RECITER,
  RECITERS,
  type ReciterId,
} from "@/data/reciters";
import {
  DEFAULT_TRANSITION,
  type TransitionMode,
  TRANSITIONS,
} from "./transitions";

/** All supported playback rates, in ascending order. */
export const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;
export type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number];

/** Arabic text size multipliers — applied on top of the responsive base size. */
export const ARABIC_FONT_SCALES = [0.8, 0.9, 1.0, 1.15, 1.3] as const;
export type ArabicFontScale = (typeof ARABIC_FONT_SCALES)[number];

// v5: UthmanicHafs v18 has been patched in-place (scripts/patch-font.py) to
// fix the root cause of the U+25CC dotted-circle rendering bug. The patch
// applies three coordinated font-table edits:
//   1. GDEF GlyphClassDef: uni06DF reclassified BASE(1) → MARK(3)
//   2. GPOS MarkToBase (9 lookups): uni06DF inserted into MarkCoverage with
//      class-0 anchors mirroring uni06E0 at (275,-25) / (0,0)
//   3. Glyph outline: the 61%-UPM composite decomposed, scaled to 20% and
//      repositioned to the superscript zone (bbox ≈ 174,624–425,875);
//      advance set to 0.
// After the patch render-check shows "Patched bad=2 ≤ Amiri baseline=2"
// confirming zero genuine orphan-dotted-circle insertions across all 6 236
// ayahs. UthmanicHafs is therefore restored as the app default.
// Bumping the key resets any stored "amiri" preference from v4 so every
// user gets the correct Madinah-mushaf typeface out of the box.
const STORAGE_KEY = "quran-listener-settings-v5";

/**
 * Identifier of the Arabic typeface used for the verse body. Both fonts
 * are bundled locally and pre-loaded at app start, so switching between
 * them at runtime is instantaneous.
 *
 * - `uthmani` → KFGQPC Uthmanic Script HAFS (the official Madinah mushaf
 *   typeface, patched in v5 to fix the U+25CC dotted-circle bug).
 *   This is the default — the traditional mushaf look most memorisers
 *   are used to, now rendering every ayah cleanly.
 * - `amiri`   → AmiriQuran (modern, comprehensive Quranic typeface with
 *   full GPOS mark / mkmk coverage for every Quranic mark in the corpus).
 */
export type ArabicFontId = "uthmani" | "amiri";

export interface ArabicFontOption {
  id: ArabicFontId;
  /** Latin label shown in the picker. */
  label: string;
  /** Short description shown under the label. */
  description: string;
  /** A short Arabic preview rendered in the option's own font. */
  preview: string;
  /** The exact `fontFamily` string registered with `expo-font`. */
  family: string;
}

export const ARABIC_FONTS: ArabicFontOption[] = [
  {
    id: "uthmani",
    label: "QPC Uthmani (recommended)",
    description:
      "Traditional Madinah mushaf script. The typeface used in printed Mushafs worldwide.",
    preview: "بِسْمِ ٱللَّهِ",
    family: "UthmanicHafs",
  },
  {
    id: "amiri",
    label: "Amiri Quran",
    description:
      "Modern Quranic typeface with full diacritic coverage.",
    preview: "بِسْمِ ٱللَّهِ",
    family: "AmiriQuran",
  },
];

const DEFAULT_ARABIC_FONT: ArabicFontId = "uthmani";

export const getArabicFont = (id: ArabicFontId): ArabicFontOption =>
  ARABIC_FONTS.find((f) => f.id === id) ?? ARABIC_FONTS[0];

/**
 * Persisted data for a user-uploaded custom background.
 *
 * - `uri`          : file:// URI (native) or base64 data URL (web images).
 *                    Blob URLs from a previous web session are discarded on
 *                    load since they do not survive page reload.
 * - `mediaType`    : 'image' or 'video'
 * - `scale`        : zoom factor applied to the media (≥ 1.0)
 * - `normalizedTx` : horizontal pan offset as a fraction of screen width
 * - `normalizedTy` : vertical pan offset as a fraction of screen height
 *
 * Storing offsets as fractions (rather than pixels) keeps the visual
 * composition identical across different screen sizes and orientations.
 */
export interface CustomBg {
  uri: string;
  mediaType: "image" | "video";
  scale: number;
  normalizedTx: number;
  normalizedTy: number;
}

export interface Settings {
  transition: TransitionMode;
  background: BackgroundId;
  ambient: AmbientId;
  ambientVolume: number; // 0..1
  /** 1-based surah number (1..114). */
  surah: number;
  /** 1-based ayah number within the current surah. */
  ayah: number;
  /**
   * When true, finishing the last ayah of a surah automatically advances
   * to the first ayah of the next surah and starts playback. Stops at
   * surah 114.
   */
  autoplayNextSurah: boolean;
  /**
   * When true, a darkening gradient is laid over the background image so
   * the verse text stays legible. When false, the user sees the image at
   * full brightness with only a faint bottom gradient kept for the
   * footer controls' contrast.
   */
  backgroundDim: boolean;
  /** Which Arabic typeface to render the verse body in. */
  arabicFont: ArabicFontId;
  /** Which reciter to stream audio from. */
  reciterId: ReciterId;
  /**
   * Playback rate applied to every recitation AudioPlayer. Must be one of
   * the values in PLAYBACK_SPEEDS (validated on load; defaults to 1×).
   */
  playbackSpeed: PlaybackSpeed;
  /**
   * When true, the current ayah is looped indefinitely rather than
   * advancing to the next one when it finishes. Useful for memorisation.
   * Defaults to false. Session-only — not persisted across launches so the
   * user never accidentally starts in loop mode.
   */
  repeatAyah: boolean;
  /**
   * Scale multiplier applied on top of the responsive Arabic base font size.
   * Allows the user to make the verse text larger or smaller to their liking.
   */
  arabicFontScale: ArabicFontScale;
  /**
   * User-uploaded custom background. Null when no custom background has
   * been set. Active only when `background === 'custom'`.
   */
  customBackground: CustomBg | null;
}

const DEFAULT_AUTOPLAY_NEXT_SURAH = true;
const DEFAULT_BACKGROUND_DIM = true;
const DEFAULT_PLAYBACK_SPEED: PlaybackSpeed = 1;
const DEFAULT_REPEAT_AYAH = false;
const DEFAULT_ARABIC_FONT_SCALE: ArabicFontScale = 1.0;

const defaultSettings: Settings = {
  transition: DEFAULT_TRANSITION,
  background: DEFAULT_BACKGROUND,
  ambient: DEFAULT_AMBIENT,
  ambientVolume: DEFAULT_AMBIENT_VOLUME,
  surah: 1,
  ayah: 1,
  autoplayNextSurah: DEFAULT_AUTOPLAY_NEXT_SURAH,
  backgroundDim: DEFAULT_BACKGROUND_DIM,
  arabicFont: DEFAULT_ARABIC_FONT,
  reciterId: DEFAULT_RECITER,
  playbackSpeed: DEFAULT_PLAYBACK_SPEED,
  repeatAyah: DEFAULT_REPEAT_AYAH,
  arabicFontScale: DEFAULT_ARABIC_FONT_SCALE,
  customBackground: null,
};

const isValidTransition = (v: unknown): v is TransitionMode =>
  typeof v === "string" && TRANSITIONS.some((t) => t.id === v);
const isValidSpeed = (v: unknown): v is PlaybackSpeed =>
  (PLAYBACK_SPEEDS as readonly number[]).includes(v as number);
const isValidBackground = (v: unknown): v is BackgroundId =>
  typeof v === "string" &&
  (v === "custom" || BACKGROUND_OPTIONS.some((b) => b.id === v));
const isValidAmbient = (v: unknown): v is AmbientId =>
  typeof v === "string" && AMBIENT_OPTIONS.some((a) => a.id === v);
const clampVolume = (v: unknown): number => {
  if (typeof v !== "number" || Number.isNaN(v)) return DEFAULT_AMBIENT_VOLUME;
  return Math.max(0, Math.min(1, v));
};
const clampSurah = (v: unknown): number => {
  if (!Number.isInteger(v) || (v as number) < 1 || (v as number) > TOTAL_SURAHS) {
    return 1;
  }
  return v as number;
};
const clampAyah = (surahNumber: number, v: unknown): number => {
  const max = getSurah(surahNumber).ayahCount;
  if (!Number.isInteger(v) || (v as number) < 1 || (v as number) > max) return 1;
  return v as number;
};
const coerceAutoplayNextSurah = (v: unknown): boolean =>
  typeof v === "boolean" ? v : DEFAULT_AUTOPLAY_NEXT_SURAH;
const coerceBackgroundDim = (v: unknown): boolean =>
  typeof v === "boolean" ? v : DEFAULT_BACKGROUND_DIM;
const isValidArabicFont = (v: unknown): v is ArabicFontId =>
  typeof v === "string" && ARABIC_FONTS.some((f) => f.id === v);
const isValidReciter = (v: unknown): v is ReciterId =>
  typeof v === "string" && RECITERS.some((r) => r.id === v);
const isValidFontScale = (v: unknown): v is ArabicFontScale =>
  (ARABIC_FONT_SCALES as readonly number[]).includes(v as number);

/**
 * Validate and sanitise a stored customBackground payload.
 * Blob: URLs from a previous web session are stale and discarded.
 */
const coerceCustomBackground = (v: unknown): CustomBg | null => {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (typeof o.uri !== "string" || !o.uri) return null;
  // Blob URLs are session-only on web — discard them on reload
  if (o.uri.startsWith("blob:")) return null;
  if (o.mediaType !== "image" && o.mediaType !== "video") return null;
  return {
    uri: o.uri,
    mediaType: o.mediaType as "image" | "video",
    scale: typeof o.scale === "number" && o.scale >= 1 ? o.scale : 1,
    normalizedTx: typeof o.normalizedTx === "number" ? o.normalizedTx : 0,
    normalizedTy: typeof o.normalizedTy === "number" ? o.normalizedTy : 0,
  };
};

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (cancelled) return;
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<Settings>;
          const surah = clampSurah(parsed.surah);
          setSettings({
            transition: isValidTransition(parsed.transition)
              ? parsed.transition
              : defaultSettings.transition,
            background: isValidBackground(parsed.background)
              ? parsed.background
              : defaultSettings.background,
            ambient: isValidAmbient(parsed.ambient)
              ? parsed.ambient
              : defaultSettings.ambient,
            ambientVolume: clampVolume(parsed.ambientVolume),
            surah,
            ayah: clampAyah(surah, parsed.ayah),
            autoplayNextSurah: coerceAutoplayNextSurah(parsed.autoplayNextSurah),
            backgroundDim: coerceBackgroundDim(parsed.backgroundDim),
            arabicFont: isValidArabicFont(parsed.arabicFont)
              ? parsed.arabicFont
              : DEFAULT_ARABIC_FONT,
            reciterId: isValidReciter(parsed.reciterId)
              ? parsed.reciterId
              : DEFAULT_RECITER,
            playbackSpeed: isValidSpeed(parsed.playbackSpeed)
              ? parsed.playbackSpeed
              : DEFAULT_PLAYBACK_SPEED,
            // repeatAyah is intentionally reset to false on every launch
            // so the user never wakes up to a stuck loop.
            repeatAyah: DEFAULT_REPEAT_AYAH,
            arabicFontScale: isValidFontScale(parsed.arabicFontScale)
              ? parsed.arabicFontScale
              : DEFAULT_ARABIC_FONT_SCALE,
            customBackground: coerceCustomBackground(parsed.customBackground),
          });
        }
      } catch {
        // ignore — fall back to defaults
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings)).catch(() => {
      // ignore
    });
  }, [settings, hydrated]);

  const setTransition = (transition: TransitionMode) =>
    setSettings((s) => ({ ...s, transition }));
  const setBackground = (background: BackgroundId) =>
    setSettings((s) => ({ ...s, background }));
  const setAmbient = (ambient: AmbientId) =>
    setSettings((s) => ({ ...s, ambient }));
  const setAmbientVolume = (ambientVolume: number) =>
    setSettings((s) => ({ ...s, ambientVolume: clampVolume(ambientVolume) }));
  const setAutoplayNextSurah = (autoplayNextSurah: boolean) =>
    setSettings((s) => ({ ...s, autoplayNextSurah }));
  const setBackgroundDim = (backgroundDim: boolean) =>
    setSettings((s) => ({ ...s, backgroundDim }));
  const setArabicFont = (arabicFont: ArabicFontId) =>
    setSettings((s) => ({ ...s, arabicFont }));
  const setReciter = (reciterId: ReciterId) =>
    setSettings((s) => ({ ...s, reciterId }));
  const setPlaybackSpeed = (playbackSpeed: PlaybackSpeed) =>
    setSettings((s) => ({ ...s, playbackSpeed }));
  const setRepeatAyah = (repeatAyah: boolean) =>
    setSettings((s) => ({ ...s, repeatAyah }));
  const setArabicFontScale = (arabicFontScale: ArabicFontScale) =>
    setSettings((s) => ({ ...s, arabicFontScale }));
  const setCustomBackground = (customBackground: CustomBg | null) =>
    setSettings((s) => ({ ...s, customBackground }));

  /**
   * Atomically update both surah and ayah. The ayah is clamped to the new
   * surah's ayah count so we can never persist an out-of-range position.
   */
  const setPosition = (surah: number, ayah: number) =>
    setSettings((s) => {
      const sN = clampSurah(surah);
      return { ...s, surah: sN, ayah: clampAyah(sN, ayah) };
    });

  /**
   * Update only the ayah within the current surah (e.g. as playback advances).
   * Skipped if the value matches what's already persisted to avoid useless
   * AsyncStorage churn on every progress tick.
   */
  const setAyah = (ayah: number) =>
    setSettings((s) => {
      const next = clampAyah(s.surah, ayah);
      if (next === s.ayah) return s;
      return { ...s, ayah: next };
    });

  return {
    settings,
    hydrated,
    setTransition,
    setBackground,
    setAmbient,
    setAmbientVolume,
    setReciter,
    setPlaybackSpeed,
    setRepeatAyah,
    setAutoplayNextSurah,
    setBackgroundDim,
    setArabicFont,
    setArabicFontScale,
    setCustomBackground,
    setPosition,
    setAyah,
  };
}
