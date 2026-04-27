import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import {
  DEFAULT_TRANSITION,
  type TransitionMode,
  TRANSITIONS,
} from "./transitions";

const STORAGE_KEY = "quran-listener-settings-v1";

export interface Settings {
  transition: TransitionMode;
}

const defaultSettings: Settings = {
  transition: DEFAULT_TRANSITION,
};

const isValidTransition = (v: unknown): v is TransitionMode =>
  typeof v === "string" && TRANSITIONS.some((t) => t.id === v);

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
          });
        }
      } catch {
        // ignore storage failures
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
      // ignore storage failures
    });
  }, [settings, hydrated]);

  const setTransition = (transition: TransitionMode) =>
    setSettings((s) => ({ ...s, transition }));

  return { settings, setTransition };
}
