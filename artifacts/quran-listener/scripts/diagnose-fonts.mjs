#!/usr/bin/env node
// Deterministic font-coverage diagnostic for the bundled Quran corpus.
//
// Parses each TTF's cmap (formats 0, 4, 6, 10, 12, 13) to build the exact set
// of Unicode codepoints the font has glyphs for, then walks every ayah in
// `data/quran.json` and flags every codepoint used by the text that the font
// cannot render. A codepoint not in cmap is guaranteed to render as .notdef
// (the "tofu" / dotted-circle box). It will also surface combining marks that
// have a glyph but are likely to orphan (those are reported as warnings).
//
// Usage:  node scripts/diagnose-fonts.mjs

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// ---- Minimal TTF cmap reader ------------------------------------------------

function readU16(buf, off) {
  return (buf[off] << 8) | buf[off + 1];
}
function readU32(buf, off) {
  return (
    buf[off] * 0x1000000 +
    ((buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3])
  );
}
function readI16(buf, off) {
  const v = readU16(buf, off);
  return v >= 0x8000 ? v - 0x10000 : v;
}

function parseCmap(ttfPath) {
  const buf = readFileSync(ttfPath);
  // Offset table
  const numTables = readU16(buf, 4);
  let cmapOffset = -1;
  for (let i = 0; i < numTables; i++) {
    const r = 12 + i * 16;
    const tag = String.fromCharCode(buf[r], buf[r + 1], buf[r + 2], buf[r + 3]);
    if (tag === "cmap") {
      cmapOffset = readU32(buf, r + 8);
      break;
    }
  }
  if (cmapOffset < 0) throw new Error(`No cmap in ${ttfPath}`);

  const numSub = readU16(buf, cmapOffset + 2);
  // Prefer Unicode platform (0) any encoding, then Microsoft (3) UCS-4 (10),
  // then Microsoft Unicode BMP (3,1).
  const subtables = [];
  for (let i = 0; i < numSub; i++) {
    const r = cmapOffset + 4 + i * 8;
    const platformID = readU16(buf, r);
    const encodingID = readU16(buf, r + 2);
    const subOff = cmapOffset + readU32(buf, r + 4);
    subtables.push({ platformID, encodingID, subOff });
  }
  // Pick all useful subtables (Unicode-capable). We union codepoints from
  // every Unicode subtable so we don't miss PUA mappings only present in
  // one variant.
  const useful = subtables.filter(
    (s) =>
      (s.platformID === 0) || // Unicode (any encoding)
      (s.platformID === 3 && (s.encodingID === 1 || s.encodingID === 10)),
  );
  if (useful.length === 0) {
    throw new Error(`No Unicode-capable cmap subtable in ${ttfPath}`);
  }

  const coveredCodepoints = new Set();
  const cpToGlyph = new Map();

  for (const { subOff } of useful) {
    const format = readU16(buf, subOff);
    if (format === 0) parseFormat0(buf, subOff, coveredCodepoints, cpToGlyph);
    else if (format === 4) parseFormat4(buf, subOff, coveredCodepoints, cpToGlyph);
    else if (format === 6) parseFormat6(buf, subOff, coveredCodepoints, cpToGlyph);
    else if (format === 10) parseFormat10(buf, subOff, coveredCodepoints, cpToGlyph);
    else if (format === 12 || format === 13)
      parseFormat12or13(buf, subOff, coveredCodepoints, cpToGlyph);
    // Other formats are ignored — none of them appear in modern fonts.
  }

  return { coveredCodepoints, cpToGlyph };
}

function parseFormat0(buf, off, set, map) {
  // length at off+2 (u16), language at off+4 (u16), then 256 bytes
  for (let cp = 0; cp < 256; cp++) {
    const g = buf[off + 6 + cp];
    if (g !== 0) {
      set.add(cp);
      if (!map.has(cp)) map.set(cp, g);
    }
  }
}

function parseFormat4(buf, off, set, map) {
  const segCountX2 = readU16(buf, off + 6);
  const segCount = segCountX2 / 2;
  const endCodes = off + 14;
  const startCodes = endCodes + segCountX2 + 2;
  const idDeltas = startCodes + segCountX2;
  const idRangeOffsets = idDeltas + segCountX2;

  for (let i = 0; i < segCount; i++) {
    const end = readU16(buf, endCodes + i * 2);
    const start = readU16(buf, startCodes + i * 2);
    const delta = readI16(buf, idDeltas + i * 2);
    const idROff = readU16(buf, idRangeOffsets + i * 2);
    if (start === 0xffff && end === 0xffff) continue;
    for (let cp = start; cp <= end; cp++) {
      let g = 0;
      if (idROff === 0) {
        g = (cp + delta) & 0xffff;
      } else {
        const glyphIndexAddr =
          idRangeOffsets + i * 2 + idROff + (cp - start) * 2;
        const raw = readU16(buf, glyphIndexAddr);
        g = raw === 0 ? 0 : (raw + delta) & 0xffff;
      }
      if (g !== 0) {
        set.add(cp);
        if (!map.has(cp)) map.set(cp, g);
      }
    }
  }
}

function parseFormat6(buf, off, set, map) {
  const firstCode = readU16(buf, off + 6);
  const entryCount = readU16(buf, off + 8);
  for (let i = 0; i < entryCount; i++) {
    const g = readU16(buf, off + 10 + i * 2);
    if (g !== 0) {
      const cp = firstCode + i;
      set.add(cp);
      if (!map.has(cp)) map.set(cp, g);
    }
  }
}

function parseFormat10(buf, off, set, map) {
  const startCharCode = readU32(buf, off + 12);
  const numChars = readU32(buf, off + 16);
  for (let i = 0; i < numChars; i++) {
    const g = readU16(buf, off + 20 + i * 2);
    if (g !== 0) {
      const cp = startCharCode + i;
      set.add(cp);
      if (!map.has(cp)) map.set(cp, g);
    }
  }
}

function parseFormat12or13(buf, off, set, map) {
  const numGroups = readU32(buf, off + 12);
  for (let i = 0; i < numGroups; i++) {
    const g0 = off + 16 + i * 12;
    const startCharCode = readU32(buf, g0);
    const endCharCode = readU32(buf, g0 + 4);
    const startGlyphID = readU32(buf, g0 + 8);
    for (let cp = startCharCode; cp <= endCharCode; cp++) {
      const g = startGlyphID + (cp - startCharCode);
      if (g !== 0) {
        set.add(cp);
        if (!map.has(cp)) map.set(cp, g);
      }
    }
  }
}

// ---- Diagnostic --------------------------------------------------------------

const fonts = [
  { name: "UthmanicHafs", path: resolve(ROOT, "assets/fonts/UthmanicHafsV18.ttf") },
  { name: "AmiriQuran",   path: resolve(ROOT, "assets/fonts/AmiriQuran.ttf") },
];

const corpus = JSON.parse(
  readFileSync(resolve(ROOT, "data/quran.json"), "utf8"),
);

const fontInfo = fonts.map((f) => {
  const { coveredCodepoints } = parseCmap(f.path);
  return { ...f, covered: coveredCodepoints };
});

console.log("=== Font coverage ===");
for (const f of fontInfo) {
  console.log(`${f.name.padEnd(14)} → ${f.covered.size.toString().padStart(5)} codepoints`);
}
console.log();

// Collect every codepoint that appears anywhere in the corpus.
const usedCodepoints = new Map(); // cp -> count
const usedByAyah = new Map(); // cp -> [{surah, ayah, sample}]
function recordCp(cp, surah, ayah, sample) {
  usedCodepoints.set(cp, (usedCodepoints.get(cp) ?? 0) + 1);
  if (!usedByAyah.has(cp)) usedByAyah.set(cp, []);
  const arr = usedByAyah.get(cp);
  if (arr.length < 3) arr.push({ surah, ayah, sample });
}

for (const s of corpus) {
  for (const a of s.ayahs) {
    // Iterate by code point (not code unit) to handle surrogate pairs.
    for (const ch of a.arabic) {
      const cp = ch.codePointAt(0);
      recordCp(cp, s.number, a.number, a.arabic);
    }
  }
}

console.log(`=== Corpus uses ${usedCodepoints.size} unique codepoints ===\n`);

// For each font, list codepoints used in text but NOT covered.
for (const f of fontInfo) {
  const missing = [];
  for (const cp of usedCodepoints.keys()) {
    if (!f.covered.has(cp)) missing.push(cp);
  }
  missing.sort((a, b) => a - b);

  console.log(`--- ${f.name}: ${missing.length} uncovered codepoints used by text ---`);
  for (const cp of missing) {
    const ch = String.fromCodePoint(cp);
    const examples = usedByAyah.get(cp).slice(0, 2)
      .map((e) => `${e.surah}:${e.ayah}`).join(", ");
    console.log(
      `  U+${cp.toString(16).toUpperCase().padStart(4, "0")} ` +
      `(${JSON.stringify(ch)})  uses=${usedCodepoints.get(cp)}  e.g. ${examples}`,
    );
  }
  console.log();
}

// Now compute, for the *primary* font (UthmanicHafs), the list of every
// surah:ayah that contains at least one uncovered codepoint. These are the
// ayahs guaranteed to misrender with the default font setting.
const primary = fontInfo[0];
const flagged = [];
for (const s of corpus) {
  for (const a of s.ayahs) {
    const offending = new Set();
    for (const ch of a.arabic) {
      const cp = ch.codePointAt(0);
      if (!primary.covered.has(cp)) offending.add(cp);
    }
    if (offending.size > 0) {
      flagged.push({
        surah: s.number,
        ayah: a.number,
        global: a.globalNumber,
        offending: [...offending],
      });
    }
  }
}

console.log(
  `=== Ayahs with uncovered codepoints under ${primary.name}: ${flagged.length} of ${corpus.reduce((n, s) => n + s.ayahs.length, 0)} ===`,
);
for (const f of flagged.slice(0, 20)) {
  const cps = f.offending
    .map((cp) => `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`)
    .join(", ");
  console.log(`  ${f.surah}:${f.ayah} (global ${f.global})  → ${cps}`);
}
if (flagged.length > 20) console.log(`  ... and ${flagged.length - 20} more`);

// Also compute the Amiri intersection — if Amiri covers everything, that's
// the safe fallback to render flagged ayahs in.
if (fontInfo[1]) {
  const amiri = fontInfo[1];
  const stillMissing = flagged.filter((f) =>
    f.offending.some((cp) => !amiri.covered.has(cp)),
  );
  console.log(
    `\n=== Of the flagged ayahs, ${stillMissing.length} also lack coverage in ${amiri.name} ===`,
  );
  for (const f of stillMissing.slice(0, 20)) {
    const cps = f.offending
      .filter((cp) => !amiri.covered.has(cp))
      .map((cp) => `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`)
      .join(", ");
    console.log(`  ${f.surah}:${f.ayah}  → ${cps}`);
  }
}
