import { useEffect, useRef, useState } from "react";
import { fetchChapterAudio } from "./quranFoundationApi";

// Module-level cache: "surahNumber:qfRecitationId" → resolved audio URL map.
const cache = new Map<string, Map<string, string>>();

/**
 * Fetches per-verse audio file URLs for a chapter from the Quran Foundation
 * Audio API and exposes them as a stable ref that `getPlayer` can read at
 * call time without taking the map as a React dependency.
 *
 * The ref is updated in-place so it never causes the audio listener effect
 * to restart — the map is only consulted at player-creation time.
 *
 * Returns:
 *  - `audioUrlsRef`: ref holding a Map<verseKey, url> (e.g. "1:1" → "https://..."),
 *    or null while the first fetch is in progress.
 *  - `loading`: true while the network request is in flight.
 *  - `error`: the last error message, or null on success.
 */
export function useQFAudio(
  surahNumber: number,
  qfRecitationId: number | null,
): { audioUrlsRef: React.MutableRefObject<Map<string, string> | null>; loading: boolean; error: string | null } {
  const cacheKey = qfRecitationId != null ? `${surahNumber}:${qfRecitationId}` : null;

  const audioUrlsRef = useRef<Map<string, string> | null>(
    cacheKey ? (cache.get(cacheKey) ?? null) : null,
  );
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
      })
      .catch((err) => {
        if (cacheKeyRef.current !== cacheKey) return;
        if ((err as Error).name === "AbortError") return;
        setError((err as Error).message ?? "Failed to load audio URLs");
        setLoading(false);
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  return { audioUrlsRef, loading, error };
}
