import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";
import { TOTAL_SURAHS } from "@/data/quran";

const STORAGE_KEY = "quran-listener-recent-surahs-v1";
const MAX_RECENT = 10;

function isValidSurahNumber(v: unknown): v is number {
  return Number.isInteger(v) && (v as number) >= 1 && (v as number) <= TOTAL_SURAHS;
}

export function useRecentSurahs() {
  const [recentSurahs, setRecentSurahs] = useState<number[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (cancelled) return;
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            const valid = parsed.filter(isValidSurahNumber).slice(0, MAX_RECENT);
            setRecentSurahs(valid);
          }
        }
      } catch {
        // ignore — fall back to empty
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(recentSurahs)).catch(() => {});
  }, [recentSurahs, hydrated]);

  const recordSurah = useCallback((surahNumber: number) => {
    if (!isValidSurahNumber(surahNumber)) return;
    setRecentSurahs((prev) => {
      const filtered = prev.filter((n) => n !== surahNumber);
      return [surahNumber, ...filtered].slice(0, MAX_RECENT);
    });
  }, []);

  return { recentSurahs, recordSurah };
}
