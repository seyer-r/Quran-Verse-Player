import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_QF_TRANSLATION_ID,
  fetchChapterTranslations,
} from "./quranFoundationApi";

// Module-level cache: "surahNumber:translationId" → resolved translation map.
// Survives re-renders but is cleared on page reload (intentional — keeps
// memory bounded and lets the user pick up fresh data on each session).
const cache = new Map<string, Map<number, string>>();

/**
 * Fetches verse translations for a chapter from the Quran Foundation API.
 *
 * Returns:
 *  - `translations`: Map of (1-based ayah number within surah) → translation text,
 *    or `null` while loading / on error.
 *  - `loading`: true while the network request is in flight.
 *  - `error`: the error message if the request failed.
 */
export function useQFTranslation(
  surahNumber: number,
  translationId: number = DEFAULT_QF_TRANSLATION_ID,
): { translations: Map<number, string> | null; loading: boolean; error: string | null } {
  const key = `${surahNumber}:${translationId}`;

  const [translations, setTranslations] = useState<Map<number, string> | null>(
    () => cache.get(key) ?? null,
  );
  const [loading, setLoading] = useState(!cache.has(key));
  const [error, setError] = useState<string | null>(null);

  // Prevent stale setState calls after component unmount or key change.
  const keyRef = useRef(key);
  keyRef.current = key;

  useEffect(() => {
    const currentKey = key;
    if (cache.has(currentKey)) {
      setTranslations(cache.get(currentKey)!);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    const controller = new AbortController();

    fetchChapterTranslations(surahNumber, translationId, controller.signal)
      .then((map) => {
        if (keyRef.current !== currentKey) return;
        cache.set(currentKey, map);
        setTranslations(map);
        setLoading(false);
      })
      .catch((err) => {
        if (keyRef.current !== currentKey) return;
        if ((err as Error).name === "AbortError") return;
        setError((err as Error).message ?? "Failed to load translation");
        setLoading(false);
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { translations, loading, error };
}
