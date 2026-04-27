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

const load = (): Settings => {
  if (typeof window === "undefined") return defaultSettings;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultSettings;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      transition: isValidTransition(parsed.transition)
        ? parsed.transition
        : defaultSettings.transition,
    };
  } catch {
    return defaultSettings;
  }
};

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(load);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // ignore storage failures (private mode, etc.)
    }
  }, [settings]);

  const setTransition = (transition: TransitionMode) =>
    setSettings((s) => ({ ...s, transition }));

  return { settings, setTransition };
}
