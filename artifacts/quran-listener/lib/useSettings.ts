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

const STORAGE_KEY = "quran-listener-settings-v3";

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
    setPosition,
    setAyah,
  };
}
