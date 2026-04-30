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
  DEFAULT_TRANSITION,
  type TransitionMode,
  TRANSITIONS,
} from "./transitions";

// v4: switched the default verse typeface from "uthmani" to "amiri" after
// confirming KFGQPC UthmanicHafs v18 lacks GPOS attachment lookups for
// several Quranic marks (notably U+06DF "small high rounded zero" used in
// 2,240 ayahs as a silent-letter marker). Without GPOS attachment the
// shaper falls back to inserting U+25CC dotted-circle bases beside the
// mark, which the user sees as a "white dot inside a dotted circle"
// dropped between letters. AmiriQuran has full GPOS coverage and renders
// every suspect mark cleanly. Bumping the key resets stored preferences
// once so the new default takes effect for everyone.
const STORAGE_KEY = "quran-listener-settings-v4";

/**
 * Identifier of the Arabic typeface used for the verse body. Both fonts
 * are bundled locally and pre-loaded at app start, so switching between
 * them at runtime is instantaneous.
 *
 * - `amiri`   → AmiriQuran (modern, comprehensive Quranic typeface with
 *   full GPOS mark / mkmk coverage for every Quranic mark in the
 *   corpus). This is the default — it renders every ayah cleanly.
 * - `uthmani` → KFGQPC Uthmanic Script HAFS (the official Madinah mushaf
 *   typeface). The "traditional mushaf" look most memorisers are used to,
 *   but the v18 build shipped with this app misrenders several Quranic
 *   marks (U+06DF, U+06E0, U+06D6) by inserting dotted-circle bases.
 *   Offered as an alternative for users who prefer the look on the ayahs
 *   that aren't affected.
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
    id: "amiri",
    label: "Amiri Quran (recommended)",
    description:
      "Modern Quranic typeface with full diacritic coverage. Renders every ayah cleanly.",
    preview: "بِسْمِ ٱللَّهِ",
    family: "AmiriQuran",
  },
  {
    id: "uthmani",
    label: "QPC Uthmani",
    description:
      "Traditional Madinah mushaf script. Note: a few Quranic silent-letter marks render as a dotted circle in this typeface.",
    preview: "بِسْمِ ٱللَّهِ",
    family: "UthmanicHafs",
  },
];

const DEFAULT_ARABIC_FONT: ArabicFontId = "amiri";

export const getArabicFont = (id: ArabicFontId): ArabicFontOption =>
  ARABIC_FONTS.find((f) => f.id === id) ?? ARABIC_FONTS[0];

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
}

const DEFAULT_AUTOPLAY_NEXT_SURAH = true;
const DEFAULT_BACKGROUND_DIM = true;

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
};

const isValidTransition = (v: unknown): v is TransitionMode =>
  typeof v === "string" && TRANSITIONS.some((t) => t.id === v);
const isValidBackground = (v: unknown): v is BackgroundId =>
  typeof v === "string" && BACKGROUND_OPTIONS.some((b) => b.id === v);
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
// Backwards-compatible: stored payloads from v3.0 don't have this field.
// Treat undefined as the default (true) so existing users get the new
// behavior without a wiped session.
const coerceAutoplayNextSurah = (v: unknown): boolean =>
  typeof v === "boolean" ? v : DEFAULT_AUTOPLAY_NEXT_SURAH;
// Backwards-compatible: stored payloads from older versions don't have
// this field. Treat undefined as the default (true) so existing users
// keep the dimmed background they're used to.
const coerceBackgroundDim = (v: unknown): boolean =>
  typeof v === "boolean" ? v : DEFAULT_BACKGROUND_DIM;
const isValidArabicFont = (v: unknown): v is ArabicFontId =>
  typeof v === "string" && ARABIC_FONTS.some((f) => f.id === v);

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
    setAutoplayNextSurah,
    setBackgroundDim,
    setArabicFont,
    setPosition,
    setAyah,
  };
}
