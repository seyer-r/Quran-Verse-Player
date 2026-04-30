#!/usr/bin/env node
// Regenerate `data/quran.json`.
//
// Usage:  node scripts/fetch-quran.mjs
//
// Sources:
//   - Arabic Uthmani text: quran.com QPC Hafs Uthmani edition
//       (https://api.quran.com/api/v4/quran/verses/uthmani)
//     This text is encoded for the KFGQPC HAFS Uthmanic Script font we ship
//     in `assets/fonts/UthmanicHafsV18.ttf`. Pairing them removes the
//     U+25CC dotted-circle placeholders that appear when a verse contains a
//     combining-mark sequence the font has no GPOS attachment lookup for.
//
//   - Surah metadata (names, meanings, revelation type, ayah counts) and
//     English translation (Sahih International): alquran.cloud, same as
//     before. Only the Arabic text is being swapped — the structure and
//     translation are unchanged.
//
// The script validates the merged data before writing so a bad upstream
// response never lands in the repo.

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(__dirname, "..", "data", "quran.json");

const ENGLISH_EDITION = "en.sahih";
const STRUCTURE_EDITION = "quran-uthmani"; // used only for surah metadata

async function fetchAlQuranCloudEdition(edition) {
  const url = `https://api.alquran.cloud/v1/quran/${edition}`;
  console.log(`Fetching ${url} ...`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${edition}`);
  const json = await res.json();
  if (json.status !== "OK") throw new Error(`API returned ${json.status} for ${edition}`);
  return json.data;
}

async function fetchQpcHafsUthmani() {
  const url = "https://api.quran.com/api/v4/quran/verses/uthmani";
  console.log(`Fetching ${url} ...`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching QPC Hafs Uthmani`);
  const json = await res.json();
  if (!Array.isArray(json.verses)) {
    throw new Error("QPC response missing `verses` array");
  }
  if (json.verses.length !== 6236) {
    throw new Error(`Expected 6236 QPC verses, got ${json.verses.length}`);
  }
  // Index by global ayah number (1..6236). The `id` field on quran.com is
  // exactly the global number across the whole Quran.
  const byGlobal = new Map();
  for (const v of json.verses) {
    if (typeof v.id !== "number" || typeof v.text_uthmani !== "string") {
      throw new Error(`Malformed QPC verse: ${JSON.stringify(v)}`);
    }
    byGlobal.set(v.id, v.text_uthmani);
  }
  return byGlobal;
}

const [structure, en, qpcByGlobal] = await Promise.all([
  fetchAlQuranCloudEdition(STRUCTURE_EDITION),
  fetchAlQuranCloudEdition(ENGLISH_EDITION),
  fetchQpcHafsUthmani(),
]);

if (structure.surahs.length !== 114 || en.surahs.length !== 114) {
  throw new Error(`Expected 114 surahs in each edition`);
}

const surahs = structure.surahs.map((arS, i) => {
  const enS = en.surahs[i];
  if (arS.number !== enS.number) {
    throw new Error(`Surah number mismatch at index ${i}: ${arS.number} vs ${enS.number}`);
  }
  if (arS.ayahs.length !== enS.ayahs.length) {
    throw new Error(`Ayah count mismatch in surah ${arS.number}: ${arS.ayahs.length} vs ${enS.ayahs.length}`);
  }
  return {
    number: arS.number,
    nameArabic: arS.name,
    nameLatin: arS.englishName,
    meaning: arS.englishNameTranslation,
    revelationType: arS.revelationType,
    ayahCount: arS.ayahs.length,
    ayahs: arS.ayahs.map((a, j) => {
      const e = enS.ayahs[j];
      if (a.numberInSurah !== e.numberInSurah || a.number !== e.number) {
        throw new Error(`Ayah numbering mismatch surah ${arS.number} ayah ${j}`);
      }
      const qpcText = qpcByGlobal.get(a.number);
      if (!qpcText) {
        throw new Error(
          `Missing QPC Hafs text for global ayah ${a.number} (surah ${arS.number}:${a.numberInSurah})`,
        );
      }
      return {
        number: a.numberInSurah,
        globalNumber: a.number,
        arabic: qpcText,
        translation: e.text,
      };
    }),
  };
});

const total = surahs.reduce((acc, s) => acc + s.ayahs.length, 0);
if (total !== 6236) throw new Error(`Expected 6236 ayahs total, got ${total}`);

mkdirSync(dirname(OUT_PATH), { recursive: true });
writeFileSync(OUT_PATH, JSON.stringify(surahs));
console.log(`Wrote ${OUT_PATH} (${surahs.length} surahs / ${total} ayahs)`);
