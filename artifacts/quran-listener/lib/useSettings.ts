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
import {
  DEFAULT_TRANSITION,
  type TransitionMode,
  TRANSITIONS,
} from "./transitions";

const STORAGE_KEY = "quran-listener-settings-v2";

export interface Settings {
  transition: TransitionMode;
  background: BackgroundId;
  ambient: AmbientId;
  ambientVolume: number; // 0..1
}

const defaultSettings: Settings = {
  transition: DEFAULT_TRANSITION,
  background: DEFAULT_BACKGROUND,
  ambient: DEFAULT_AMBIENT,
  ambientVolume: DEFAULT_AMBIENT_VOLUME,
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

  return {
    settings,
    setTransition,
    setBackground,
    setAmbient,
    setAmbientVolume,
  };
}
