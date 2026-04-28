#!/usr/bin/env node
// Stand-alone validation runner. Mirrors the runtime `validateQuran` checks
// so you can verify the bundled corpus from CI / the shell without launching
// the app. Exits 0 on success, 1 on failure.

import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const surahs = require("../data/quran.json");

const TOTAL_SURAHS = 114;
const TOTAL_AYAHS = 6236;

const errors = [];
let runningTotal = 0;
let expectedGlobal = 1;

if (surahs.length !== TOTAL_SURAHS) {
  errors.push(`Expected ${TOTAL_SURAHS} surahs, got ${surahs.length}`);
}

for (let i = 0; i < surahs.length; i++) {
  const s = surahs[i];
  const expectedNumber = i + 1;
  if (s.number !== expectedNumber) errors.push(`Surah[${i}].number=${s.number} expected ${expectedNumber}`);
  if (!s.nameArabic || !s.nameLatin) errors.push(`Surah ${s.number} missing name`);
  if (s.revelationType !== "Meccan" && s.revelationType !== "Medinan") {
    errors.push(`Surah ${s.number} bad revelationType "${s.revelationType}"`);
  }
  if (s.ayahCount !== s.ayahs.length) {
    errors.push(`Surah ${s.number} ayahCount=${s.ayahCount} != ayahs.length=${s.ayahs.length}`);
  }
  for (let j = 0; j < s.ayahs.length; j++) {
    const a = s.ayahs[j];
    if (a.number !== j + 1) errors.push(`Surah ${s.number} ayah[${j}].number=${a.number} expected ${j + 1}`);
    if (a.globalNumber !== expectedGlobal) {
      errors.push(`Surah ${s.number} ayah ${a.number} globalNumber=${a.globalNumber} expected ${expectedGlobal}`);
    }
    if (typeof a.arabic !== "string" || !a.arabic) errors.push(`Surah ${s.number} ayah ${a.number} no arabic`);
    if (typeof a.translation !== "string" || !a.translation) errors.push(`Surah ${s.number} ayah ${a.number} no translation`);
    expectedGlobal++;
  }
  runningTotal += s.ayahs.length;
}

if (runningTotal !== TOTAL_AYAHS) errors.push(`Total ayahs ${runningTotal} expected ${TOTAL_AYAHS}`);

if (errors.length > 0) {
  console.error(`VALIDATION FAILED — ${errors.length} error(s):`);
  for (const e of errors.slice(0, 50)) console.error("  - " + e);
  if (errors.length > 50) console.error(`  ... and ${errors.length - 50} more`);
  process.exit(1);
} else {
  console.log(`OK — ${TOTAL_SURAHS} surahs, ${TOTAL_AYAHS} ayahs, all aligned.`);
}
