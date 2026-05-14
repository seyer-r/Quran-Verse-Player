import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useRef, useState } from "react";
import { getSurah, TOTAL_SURAHS } from "@/data/quran";
import {
  addQFBookmark,
  deleteQFBookmark,
  fetchQFBookmarks,
} from "./qfUserApi";

const STORAGE_KEY = "quran-listener-bookmarks-v2";
const MAX_BOOKMARKS = 50;

export interface Bookmark {
  surah: number;
  ayah: number;
  savedAt: number;
  /** QF bookmark ID — present when this bookmark has been synced to the QF User API. */
  qfId?: string;
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

export function useBookmarks(token: string | null = null) {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const tokenRef = useRef(token);
  tokenRef.current = token;

  // Hydrate from local storage.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (cancelled) return;
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            setBookmarks(parsed.filter(isValidBookmark).slice(0, MAX_BOOKMARKS));
          }
        }
      } catch {
        // fall back to empty
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Persist to local storage whenever bookmarks change.
  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(bookmarks)).catch(() => {});
  }, [bookmarks, hydrated]);

  // When a QF token becomes available, fetch remote bookmarks and merge.
  useEffect(() => {
    if (!token || !hydrated) return;
    let cancelled = false;
    setSyncing(true);
    fetchQFBookmarks(token)
      .then((qfBookmarks) => {
        if (cancelled) return;
        setBookmarks((prev) => {
          const merged = [...prev];
          for (const qfBm of qfBookmarks) {
            const [surahStr, ayahStr] = qfBm.verseKey.split(":");
            const surah = Number(surahStr);
            const ayah = Number(ayahStr);
            if (!surah || !ayah) continue;
            const existing = merged.findIndex(
              (b) => b.surah === surah && b.ayah === ayah,
            );
            if (existing >= 0) {
              // Attach QF ID to existing local bookmark.
              merged[existing] = { ...merged[existing], qfId: qfBm.id };
            } else {
              // Remote bookmark not in local — add it.
              merged.unshift({ surah, ayah, savedAt: Date.now(), qfId: qfBm.id });
            }
          }
          return merged.slice(0, MAX_BOOKMARKS);
        });
      })
      .catch((err) => {
        if (__DEV__) console.warn("[QF bookmarks] sync failed:", err);
      })
      .finally(() => { if (!cancelled) setSyncing(false); });
    return () => { cancelled = true; };
  }, [token, hydrated]);

  const isBookmarked = useCallback(
    (surah: number, ayah: number): boolean =>
      bookmarks.some((b) => b.surah === surah && b.ayah === ayah),
    [bookmarks],
  );

  const toggleBookmark = useCallback(
    async (surah: number, ayah: number) => {
      const existing = bookmarks.find(
        (b) => b.surah === surah && b.ayah === ayah,
      );

      if (existing) {
        // Remove locally first for instant UI feedback.
        setBookmarks((prev) =>
          prev.filter((b) => !(b.surah === surah && b.ayah === ayah)),
        );
        // Remove remotely if we have a QF ID.
        if (tokenRef.current && existing.qfId) {
          deleteQFBookmark(tokenRef.current, existing.qfId).catch((err) => {
            if (__DEV__) console.warn("[QF bookmarks] delete failed:", err);
          });
        }
      } else {
        const newBm: Bookmark = { surah, ayah, savedAt: Date.now() };
        // Add locally immediately.
        setBookmarks((prev) =>
          [newBm, ...prev].slice(0, MAX_BOOKMARKS),
        );
        // Add remotely; attach QF ID when it comes back.
        if (tokenRef.current) {
          addQFBookmark(tokenRef.current, `${surah}:${ayah}`)
            .then((qfBm) => {
              setBookmarks((prev) =>
                prev.map((b) =>
                  b.surah === surah && b.ayah === ayah && !b.qfId
                    ? { ...b, qfId: qfBm.id }
                    : b,
                ),
              );
            })
            .catch((err) => {
              if (__DEV__) console.warn("[QF bookmarks] add failed:", err);
            });
        }
      }
    },
    [bookmarks],
  );

  return { bookmarks, isBookmarked, toggleBookmark, syncing };
}
