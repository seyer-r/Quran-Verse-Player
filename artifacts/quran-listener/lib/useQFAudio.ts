import { useEffect, useRef, useState } from "react";
import { fetchChapterAudio } from "./quranFoundationApi";

// Module-level cache: "surahNumber:qfRecitationId" → resolved audio URL map.
const cache = new Map<string, Map<string, string>>();

/**
 * Fetches per-verse audio file URLs for a chapter from the Quran Foundation
 * Audio API.
 *
 * Returns:
 *  - `audioUrlsRef`: ref holding Map<verseKey, url> (e.g. "1:1" → "https://...").
 *    Read by getPlayer at call-time without taking it as a React dependency.
 *  - `fetchCount`: increments each time a successful fetch completes.
 *    index.tsx watches this to reset any already-created players so they
 *    get recreated with QF URLs on next access.
 *  - `loading`: true while the network request is in flight.
 *  - `error`: last error message, or null.
 */
export function useQFAudio(
  surahNumber: number,
  qfRecitationId: number | null,
): {
  audioUrlsRef: React.MutableRefObject<Map<string, string> | null>;
  fetchCount: number;
  loading: boolean;
  error: string | null;
} {
  const cacheKey = qfRecitationId != null ? `${surahNumber}:${qfRecitationId}` : null;

  const audioUrlsRef = useRef<Map<string, string> | null>(
    cacheKey ? (cache.get(cacheKey) ?? null) : null,
  );
  const [fetchCount, setFetchCount] = useState(cache.has(cacheKey ?? "") ? 1 : 0);
  const [loading, setLoading] = useState(cacheKey ? !cache.has(cacheKey) : false);
  const [error, setError] = useState<string | null>(null);

  const cacheKeyRef = useRef(cacheKey);
  cacheKeyRef.current = cacheKey;

  useEffect(() => {
    if (!cacheKey || qfRecitationId == null) {
      audioUrlsRef.current = null;
      setLoading(false);
      setError(null);
      return;
    }

    if (cache.has(cacheKey)) {
      audioUrlsRef.current = cache.get(cacheKey)!;
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    const controller = new AbortController();

    fetchChapterAudio(surahNumber, qfRecitationId, controller.signal)
      .then((map) => {
        if (cacheKeyRef.current !== cacheKey) return;
        cache.set(cacheKey, map);
        audioUrlsRef.current = map;
        setLoading(false);
        setFetchCount((n) => n + 1);
        if (__DEV__) {
          const sample = [...map.entries()][0];
          console.log(`[QF audio] surah ${surahNumber} recitation ${qfRecitationId}: ${map.size} URLs. Sample: ${sample?.[0]} → ${sample?.[1]}`);
        }
      })
      .catch((err) => {
        if (cacheKeyRef.current !== cacheKey) return;
        if ((err as Error).name === "AbortError") return;
        const msg = (err as Error).message ?? "Failed to load QF audio URLs";
        setError(msg);
        setLoading(false);
        if (__DEV__) console.warn(`[QF audio] fetch failed (surah ${surahNumber}, recitation ${qfRecitationId}):`, msg);
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  return { audioUrlsRef, fetchCount, loading, error };
}
