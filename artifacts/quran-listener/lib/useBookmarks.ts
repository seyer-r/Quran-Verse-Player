import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";
import { getSurah, TOTAL_SURAHS } from "@/data/quran";

const STORAGE_KEY = "quran-listener-bookmarks-v1";
const MAX_BOOKMARKS = 50;

export interface Bookmark {
  surah: number;
  ayah: number;
  savedAt: number;
}

function isValidBookmark(v: unknown): v is Bookmark {
  if (!v || typeof v !== "object") return false;
  const b = v as Record<string, unknown>;
  if (
    !Number.isInteger(b.surah) ||
    (b.surah as number) < 1 ||
    (b.surah as number) > TOTAL_SURAHS
  )
    return false;
  if (!Number.isInteger(b.ayah) || (b.ayah as number) < 1) return false;
  if (typeof b.savedAt !== "number") return false;
  try {
    const s = getSurah(b.surah as number);
    if ((b.ayah as number) > s.ayahCount) return false;
  } catch {
    return false;
  }
  return true;
}

export function useBookmarks() {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
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
            const valid = parsed
              .filter(isValidBookmark)
              .slice(0, MAX_BOOKMARKS);
            setBookmarks(valid);
          }
        }
      } catch {
        // ignore — fall back to empty
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
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(bookmarks)).catch(() => {});
  }, [bookmarks, hydrated]);

  const isBookmarked = useCallback(
    (surah: number, ayah: number): boolean =>
      bookmarks.some((b) => b.surah === surah && b.ayah === ayah),
    [bookmarks],
  );

  const toggleBookmark = useCallback((surah: number, ayah: number) => {
    setBookmarks((prev) => {
      const exists = prev.some((b) => b.surah === surah && b.ayah === ayah);
      if (exists) {
        return prev.filter((b) => !(b.surah === surah && b.ayah === ayah));
      }
      return [{ surah, ayah, savedAt: Date.now() }, ...prev].slice(
        0,
        MAX_BOOKMARKS,
      );
    });
  }, []);

  return { bookmarks, isBookmarked, toggleBookmark };
}
