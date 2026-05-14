const QF_API = "https://api.quran.com";

// ─── Translation resource types ───────────────────────────────────────────────

export interface QFTranslationOption {
  id: number;
  name: string;
  authorName: string;
  language: string; // Display-capitalised, e.g. "English"
  languageKey: string; // Raw API value, e.g. "english"
}

export const DEFAULT_QF_TRANSLATION_ID = 131;

/**
 * Fallback list used before the full translation list has been fetched.
 * Covers the most common English choices so the picker is never empty.
 */
export const QF_TRANSLATIONS_FALLBACK: QFTranslationOption[] = [
  { id: 131, name: "Sahih International",         authorName: "Sahih International",       language: "English",         languageKey: "english" },
  { id: 20,  name: "Pickthall",                   authorName: "Mohammed Marmaduke Pickthall", language: "English",      languageKey: "english" },
  { id: 85,  name: "The Clear Quran",             authorName: "Dr. Mustafa Khattab",       language: "English",         languageKey: "english" },
  { id: 203, name: "Dr. Wahiduddin Khan",         authorName: "Dr. Wahiduddin Khan",       language: "English",         languageKey: "english" },
  { id: 149, name: "Transliteration",             authorName: "Transliteration",           language: "Transliteration", languageKey: "transliteration" },
];

export function getQFTranslationName(
  id: number,
  allTranslations: QFTranslationOption[],
): string {
  const found =
    allTranslations.find((t) => t.id === id) ??
    QF_TRANSLATIONS_FALLBACK.find((t) => t.id === id);
  return found?.name ?? "Translation";
}

// ─── Resources API ────────────────────────────────────────────────────────────

interface RawTranslation {
  id: number;
  name: string;
  author_name: string;
  language_name: string;
}

function capitalise(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/**
 * Fetch the full list of available translations from the QF Resources API.
 * Returns them sorted: English first, then all other languages alphabetically.
 */
export async function fetchAllTranslations(
  signal?: AbortSignal,
): Promise<QFTranslationOption[]> {
  const res = await fetch(`${QF_API}/api/v4/resources/translations`, { signal });
  if (!res.ok) throw new Error(`QF resources: ${res.status} ${res.statusText}`);
  const data = (await res.json()) as { translations?: RawTranslation[] };
  return (data.translations ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    authorName: t.author_name,
    language: capitalise(t.language_name),
    languageKey: t.language_name.toLowerCase(),
  }));
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
