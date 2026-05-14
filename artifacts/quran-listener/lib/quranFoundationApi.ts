const QF_API = "https://api.quran.com";

// ─── Translation options ──────────────────────────────────────────────────────

export interface QFTranslationOption {
  id: number;
  name: string;
  language: string;
}

/** Curated list of translations available from the Quran Foundation API. */
export const QF_TRANSLATIONS: QFTranslationOption[] = [
  { id: 131, name: "Sahih International", language: "English" },
  { id: 20,  name: "Pickthall", language: "English" },
  { id: 85,  name: "The Clear Quran (Khattab)", language: "English" },
  { id: 203, name: "Dr. Wahiduddin Khan", language: "English" },
  { id: 149, name: "Transliteration", language: "Transliteration" },
];

export const DEFAULT_QF_TRANSLATION_ID = 131;

export function getQFTranslation(id: number): QFTranslationOption {
  return QF_TRANSLATIONS.find((t) => t.id === id) ?? QF_TRANSLATIONS[0];
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface RawVerse {
  verse_key: string;
  translations?: { resource_id: number; text: string }[];
}

interface RawAudioFile {
  verse_key: string;
  url: string;
}

// ─── Translation API ──────────────────────────────────────────────────────────

/**
 * Fetch all verse translations for a chapter from the Quran Foundation API.
 * Returns a Map of (1-based ayah number within surah) → plain-text translation.
 * HTML tags (from QF API footnotes) are stripped.
 */
export async function fetchChapterTranslations(
  chapterNumber: number,
  translationId: number,
  signal?: AbortSignal,
): Promise<Map<number, string>> {
  const url =
    `${QF_API}/api/v4/verses/by_chapter/${chapterNumber}` +
    `?translations=${translationId}&fields=verse_key&per_page=300`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`QF translations: ${res.status} ${res.statusText}`);
  const data = (await res.json()) as { verses?: RawVerse[] };
  const map = new Map<number, string>();
  for (const v of data.verses ?? []) {
    const [, ayahStr] = v.verse_key.split(":");
    const ayahNum = Number(ayahStr);
    const raw = v.translations?.[0]?.text ?? "";
    // Strip any HTML tags (QF sometimes embeds footnotes as <sup> elements)
    const plain = raw.replace(/<[^>]*>/g, "").trim();
    if (ayahNum && plain) map.set(ayahNum, plain);
  }
  return map;
}

// ─── Audio API ────────────────────────────────────────────────────────────────

/**
 * Fetch all audio file URLs for a chapter from the Quran Foundation Audio API.
 * Returns a Map of verse_key ("surah:ayah") → absolute audio URL.
 */
export async function fetchChapterAudio(
  chapterNumber: number,
  qfRecitationId: number,
  signal?: AbortSignal,
): Promise<Map<string, string>> {
  const url =
    `${QF_API}/api/v4/recitations/${qfRecitationId}/by_chapter/${chapterNumber}` +
    `?per_page=300`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`QF audio: ${res.status} ${res.statusText}`);
  const data = (await res.json()) as { audio_files?: RawAudioFile[] };
  const map = new Map<string, string>();
  for (const f of data.audio_files ?? []) {
    if (f.verse_key && f.url) map.set(f.verse_key, f.url);
  }
  return map;
}
