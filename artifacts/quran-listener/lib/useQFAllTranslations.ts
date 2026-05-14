import { useEffect, useRef, useState } from "react";
import {
  fetchAllTranslations,
  QF_TRANSLATIONS_FALLBACK,
  type QFTranslationOption,
} from "./quranFoundationApi";

let cached: QFTranslationOption[] | null = null;

/**
 * Fetches the full list of available translations from the Quran Foundation
 * Resources API. The result is cached at module level so it's only fetched
 * once per app session. Falls back to QF_TRANSLATIONS_FALLBACK while loading
 * or on error.
 */
export function useQFAllTranslations(): {
  translations: QFTranslationOption[];
  loading: boolean;
} {
  const [translations, setTranslations] = useState<QFTranslationOption[]>(
    cached ?? QF_TRANSLATIONS_FALLBACK,
  );
  const [loading, setLoading] = useState(cached === null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    if (cached !== null) {
      setTranslations(cached);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    fetchAllTranslations(controller.signal)
      .then((list) => {
        if (!mounted.current) return;
        cached = list;
        setTranslations(list);
        setLoading(false);
      })
      .catch((err) => {
        if (!mounted.current) return;
        if ((err as Error).name === "AbortError") return;
        // Keep the fallback list visible on error
        setLoading(false);
      });

    return () => {
      mounted.current = false;
      controller.abort();
    };
  }, []);

  return { translations, loading };
}
