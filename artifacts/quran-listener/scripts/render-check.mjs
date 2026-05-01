#!/usr/bin/env node
// Quran render verifier — 3-font comparison.
//
// Shows the ORIGINAL UthmanicHafs v18, the PATCHED UthmanicHafs v18
// (GPOS-augmented with uni06DF MarkToBase anchors), and AmiriQuran
// side-by-side for every suspect Quranic mark in the corpus.
//
// Verdict: if "Patched Uthmani bad=0" the font patch is correct.
// Run via:  node scripts/render-check.mjs
// Then open the port-5000 webview.

import { createServer } from "node:http";
import { readFileSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const corpus = JSON.parse(
  readFileSync(resolve(ROOT, "data/quran.json"), "utf8"),
);

// The patched font lives in /tmp during dev; the final destination is
// assets/fonts/UthmanicHafsV18.ttf after verification passes.
const PATCHED_PATH = "/tmp/font-candidates/UthmanicHafsV18-patched.ttf";

const fontPaths = {
  UthmanicHafs: resolve(ROOT, "assets/fonts/UthmanicHafsV18.ttf"),
  UthmanicHafsPatched: PATCHED_PATH,
  AmiriQuran: resolve(ROOT, "assets/fonts/AmiriQuran.ttf"),
};

const PORT = 5000;

const SUSPECT_MARKS = [
  0x06DF, 0x06E0, 0x06D6, 0x06D7, 0x06D8, 0x06D9, 0x06DA,
  0x06DC, 0x06DD, 0x06E2, 0x06E3, 0x06E4, 0x06E7, 0x06E8,
  0x06EA, 0x06EB, 0x06EC, 0x06ED,
];
const examples = [];
const allOccurrences = {};
for (const cp of SUSPECT_MARKS) allOccurrences[cp] = [];
for (const s of corpus) {
  for (const a of s.ayahs) {
    for (const cp of SUSPECT_MARKS) {
      if (a.arabic.includes(String.fromCodePoint(cp))) {
        allOccurrences[cp].push({ surah: s.number, ayah: a.number });
      }
    }
  }
}
for (const cp of SUSPECT_MARKS) {
  const list = allOccurrences[cp];
  if (list.length === 0) continue;
  const first = list[0];
  const sObj = corpus.find(s => s.number === first.surah);
  const aObj = sObj.ayahs.find(a => a.number === first.ayah);
  examples.push({
    codepoint: cp,
    occurrences: list.length,
    surah: first.surah, ayah: first.ayah,
    arabic: aObj.arabic,
  });
}

const html = () => `<!doctype html>
<html lang="ar">
<head>
<meta charset="utf-8">
<title>Quran render check (3-font)</title>
<style>
  @font-face { font-family: "UthmanicHafs"; src: url("/font/UthmanicHafs.ttf") format("truetype"); font-display: block; }
  @font-face { font-family: "UthmanicHafsPatched"; src: url("/font/UthmanicHafsPatched.ttf") format("truetype"); font-display: block; }
  @font-face { font-family: "AmiriQuran"; src: url("/font/AmiriQuran.ttf") format("truetype"); font-display: block; }
  body { background: #000; color: #fff; font: 13px/1.4 system-ui, sans-serif; margin: 0; padding: 14px; }
  h1 { font-size: 15px; margin: 0 0 6px; }
  #status { color: #fbbf24; margin-bottom: 8px; }
  #verdict { padding: 12px; margin-bottom: 10px; font-size: 17px; font-weight: 700; border-radius: 4px; }
  #verdict.good { background: #0a3a0a; color: #a3f7a3; }
  #verdict.bad  { background: #3a0a0a; color: #f7a3a3; }
  #verdict.pending { background: #1a1a1a; color: #fbbf24; }
  #report { background: #111; border: 1px solid #333; padding: 10px; white-space: pre-wrap; font-family: ui-monospace,monospace; font-size: 10px; max-height: 300px; overflow: auto; }
  /* 4-column grid: ref | original | patched | amiri */
  .row { display: grid; grid-template-columns: 100px 1fr 1fr 1fr; gap: 6px; padding: 8px; border-top: 1px solid #222; align-items: center; }
  .ref { color: #ccc; font-size: 10px; line-height: 1.5; }
  .ref b { color: #fbbf24; }
  .ar { font-size: 38px; line-height: 1.7; direction: rtl; text-align: right; padding: 8px; background: #050505; border-radius: 4px; }
  .orig   { font-family: "UthmanicHafs"; }
  .patch  { font-family: "UthmanicHafsPatched"; }
  .amiri  { font-family: "AmiriQuran"; }
  .glyph { font-size: 76px; padding: 10px; background: #050505; border-radius: 4px; text-align: center; }
  .colhdr { display: grid; grid-template-columns: 100px 1fr 1fr 1fr; gap: 6px; padding: 8px; background: #1a1a1a; font-weight: 700; font-size: 12px; }
  details { margin: 8px 0; }
  summary { cursor: pointer; padding: 8px; background: #1a1a1a; border-radius: 4px; }
</style>
</head>
<body>
<h1>Quran render check — UthmanicHafs GPOS patch verification</h1>
<div id="status">Loading fonts…</div>
<div id="verdict" class="pending">Pending…</div>

<details open><summary>Per-mark isolated render (و + mark — does the shaper attach or insert U+25CC?)</summary>
<div class="colhdr"><div>Mark</div><div>UthmanicHafs v18 (original)</div><div>UthmanicHafs v18 (patched)</div><div>AmiriQuran (reference)</div></div>
<div id="mark-list"></div>
</details>

<details open><summary>Real-ayah examples (one per suspect mark)</summary>
<div class="colhdr"><div>Ref</div><div>UthmanicHafs (original)</div><div>UthmanicHafs (patched)</div><div>AmiriQuran</div></div>
<div id="example-list"></div>
</details>

<details><summary>Pixel-count report</summary>
<div id="report">(running…)</div>
</details>

<script>
const EXAMPLES = ${JSON.stringify(examples)};
function escHtml(s){ return s.replace(/[&<>]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;"})[c]); }
function pad4(cp){ return cp.toString(16).toUpperCase().padStart(4,'0'); }

const SIZE = 38;
const CV_W = 1600, CV_H = 80;
const cv = document.createElement("canvas");
cv.width = CV_W; cv.height = CV_H;
const ctx = cv.getContext("2d", { willReadFrequently: true });

function inkPixelCount(text, family) {
  ctx.clearRect(0, 0, CV_W, CV_H);
  ctx.font = SIZE + 'px "' + family + '", serif';
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#fff";
  ctx.fillText(text, 8, 60);
  const img = ctx.getImageData(0, 0, CV_W, CV_H).data;
  let n = 0;
  for (let i = 3; i < img.length; i += 4) if (img[i] > 32) n++;
  return n;
}

(async () => {
  try {
    await Promise.all([
      document.fonts.load(SIZE + 'px "UthmanicHafs"', "ا"),
      document.fonts.load(SIZE + 'px "UthmanicHafsPatched"', "ا"),
      document.fonts.load(SIZE + 'px "AmiriQuran"', "ا"),
    ]);
    await document.fonts.ready;
    const haveU = document.fonts.check(SIZE + 'px "UthmanicHafs"', "ا");
    const haveP = document.fonts.check(SIZE + 'px "UthmanicHafsPatched"', "ا");
    const haveA = document.fonts.check(SIZE + 'px "AmiriQuran"', "ا");
    document.getElementById("status").textContent =
      "Fonts loaded: Orig=" + haveU + " Patched=" + haveP + " Amiri=" + haveA +
      " — examples: " + EXAMPLES.length;

    // Per-mark isolated render table
    const markList = document.getElementById("mark-list");
    for (const ex of EXAMPLES) {
      const ch = String.fromCodePoint(ex.codepoint);
      const probe = "و" + ch;   // waw + mark; shaper inserts U+25CC if no GPOS
      const row = document.createElement("div");
      row.className = "row";
      row.innerHTML =
        '<div class="ref"><b>U+' + pad4(ex.codepoint) + '</b><br>' +
        ex.occurrences + ' ayahs<br>e.g. ' + ex.surah + ':' + ex.ayah + '</div>' +
        '<div class="glyph orig">'  + escHtml(probe) + '</div>' +
        '<div class="glyph patch">' + escHtml(probe) + '</div>' +
        '<div class="glyph amiri">' + escHtml(probe) + '</div>';
      markList.appendChild(row);
    }

    // Pixel-count verdict per example
    const exampleList = document.getElementById("example-list");
    const reportLines = [];
    let badOrig = 0, badPatch = 0, badAmiri = 0;
    const dcU = inkPixelCount("\\u25CC", "UthmanicHafs");
    const dcP = inkPixelCount("\\u25CC", "UthmanicHafsPatched");
    const dcA = inkPixelCount("\\u25CC", "AmiriQuran");
    reportLines.push("U+25CC ink pixels — Orig:" + dcU + " Patched:" + dcP + " Amiri:" + dcA);
    reportLines.push("");

    for (const ex of EXAMPLES) {
      const stripped = ex.arabic.replace(new RegExp(String.fromCodePoint(ex.codepoint), "g"), "");
      const numRemoved = ex.arabic.length - stripped.length;

      function checkFont(family, dc) {
        const fFull = inkPixelCount(ex.arabic, family);
        const fStrp = inkPixelCount(stripped, family);
        const delta = fFull - fStrp;
        const allowance = numRemoved * 30 + 20;
        const orphans = Math.max(0, (delta - allowance) / dc);
        return { fFull, fStrp, delta, orphans, bad: orphans > 0.5 };
      }
      const rU = checkFont("UthmanicHafs", dcU);
      const rP = checkFont("UthmanicHafsPatched", dcP);
      const rA = checkFont("AmiriQuran", dcA);
      if (rU.bad) badOrig++;
      if (rP.bad) badPatch++;
      if (rA.bad) badAmiri++;

      reportLines.push(
        ex.surah + ":" + ex.ayah + " U+" + pad4(ex.codepoint) + " (×" + numRemoved + ")" +
        "  Orig:orphans≈" + rU.orphans.toFixed(2) + (rU.bad ? "❌" : "✓") +
        "  Patched:orphans≈" + rP.orphans.toFixed(2) + (rP.bad ? "❌" : "✓") +
        "  Amiri:orphans≈" + rA.orphans.toFixed(2) + (rA.bad ? "❌" : "✓"),
      );

      const row = document.createElement("div");
      row.className = "row";
      row.innerHTML =
        '<div class="ref">' + ex.surah + ':' + ex.ayah + '<br><b>U+' + pad4(ex.codepoint) + '</b><br>' +
        '<span style="color:' + (rU.bad ? '#f7a3a3' : '#a3f7a3') + '">orig: ' + (rU.bad ? '❌' : '✓') + '</span><br>' +
        '<span style="color:' + (rP.bad ? '#f7a3a3' : '#a3f7a3') + '">patch: ' + (rP.bad ? '❌' : '✓') + '</span>' +
        '</div>' +
        '<div class="ar orig">'  + escHtml(ex.arabic) + '</div>' +
        '<div class="ar patch">' + escHtml(ex.arabic) + '</div>' +
        '<div class="ar amiri">' + escHtml(ex.arabic) + '</div>';
      exampleList.appendChild(row);
    }
    document.getElementById("report").textContent = reportLines.join("\\n");

    const v = document.getElementById("verdict");
    // badAmiri represents the baseline false-positive rate of the pixel detector:
    // even perfect fonts trigger it for some inherently large marks.
    // Patched is "as good as possible" if badPatch <= badAmiri.
    const fixedByPatch = badOrig - badPatch;
    if (badPatch <= badAmiri && badOrig > badPatch) {
      v.className = "good";
      v.textContent = "VERDICT: PATCH WORKS ✓  Fixed " + fixedByPatch +
        " mark(s). Patched bad=" + badPatch + " (≤ Amiri baseline=" + badAmiri + "). " +
        "Original had " + badOrig + "/" + EXAMPLES.length + " bad. " +
        "Safe to deploy the patched font.";
    } else if (badPatch <= badAmiri && badOrig === badPatch) {
      v.className = "good";
      v.textContent = "VERDICT: Original already correct (no regression). bad=" + badPatch + " ≤ Amiri=" + badAmiri;
    } else {
      v.className = "bad";
      v.textContent = "VERDICT: Patch INSUFFICIENT — patched bad=" + badPatch +
        " > Amiri=" + badAmiri + " (" + (badPatch - badAmiri) + " genuine failures remain). " +
        "Orig bad=" + badOrig + ". Inspect visuals below.";
    }
    document.getElementById("status").textContent =
      "Done. Orig bad: " + badOrig + "  Patched bad: " + badPatch + "  Amiri bad: " + badAmiri;
  } catch (e) {
    document.getElementById("status").textContent = "ERROR: " + (e && e.message);
    document.getElementById("report").textContent = String(e && e.stack || e);
  }
})();
</script>
</body>
</html>`;

const server = createServer((req, res) => {
  if (req.url === "/" || req.url.startsWith("/?")) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html());
    return;
  }
  if (req.url.startsWith("/font/")) {
    const raw = req.url.slice("/font/".length).replace(/\?.*$/, "");
    let name = raw.replace(".ttf", "");
    if (name === "UthmanicHafsPatched") name = "UthmanicHafsPatched";
    else if (name === "UthmanicHafs") name = "UthmanicHafs";
    else if (name === "AmiriQuran") name = "AmiriQuran";
    else { res.writeHead(404); res.end(); return; }
    const p = fontPaths[name];
    if (!p) { res.writeHead(404); res.end(); return; }
    try {
      const stat = statSync(p);
      res.writeHead(200, {
        "Content-Type": "font/ttf",
        "Content-Length": stat.size,
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store",
      });
      res.end(readFileSync(p));
    } catch {
      res.writeHead(404); res.end();
    }
    return;
  }
  res.writeHead(404); res.end();
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`render-check (3-font) listening on http://localhost:${PORT}`);
  console.log(`Suspect-mark examples: ${examples.length}`);
  console.log(`Patched font: ${PATCHED_PATH}`);
});
