#!/usr/bin/env node
// Regenerate `data/quran.json` from alquran.cloud.
//
// Usage:  node scripts/fetch-quran.mjs
//
// This script is run rarely — only when the bundled corpus needs to be
// refreshed (e.g. to swap the translation edition). It validates the merged
// data before writing so a bad upstream response never lands in the repo.

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(__dirname, "..", "data", "quran.json");

const ARABIC_EDITION = "quran-uthmani";
const ENGLISH_EDITION = "en.sahih";

async function fetchEdition(edition) {
  const url = `https://api.alquran.cloud/v1/quran/${edition}`;
  console.log(`Fetching ${url} ...`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${edition}`);
  const json = await res.json();
  if (json.status !== "OK") throw new Error(`API returned ${json.status} for ${edition}`);
  return json.data;
}

const [ar, en] = await Promise.all([
  fetchEdition(ARABIC_EDITION),
  fetchEdition(ENGLISH_EDITION),
]);

if (ar.surahs.length !== 114 || en.surahs.length !== 114) {
  throw new Error(`Expected 114 surahs in each edition`);
}

const surahs = ar.surahs.map((arS, i) => {
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
      return {
        number: a.numberInSurah,
        globalNumber: a.number,
        arabic: a.text,
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
