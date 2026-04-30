#!/usr/bin/env node
// Quran render verifier (fast / visual).
//
// Serves a static page on port 5000 that:
//   1. Loads UthmanicHafs.ttf and AmiriQuran.ttf via @font-face — same
//      mechanism react-native-web uses for the running app.
//   2. After document.fonts.ready, runs a TARGETED check: it finds every ayah
//      in the bundled corpus that contains one of the marks suspected of
//      triggering U+25CC dotted-circle insertion in UthmanicHafs:
//        U+06DF  ARABIC SMALL HIGH ROUNDED ZERO  (silent letter mark)
//        U+06E0  ARABIC SMALL HIGH UPRIGHT RECTANGULAR ZERO
//        U+06D6..U+06DA  small high mark words (sajdah signs etc)
//        U+06DC..U+06DD  small high seen / end of ayah
//        U+06E2..U+06E4  small high letters
//        U+06E7..U+06E8  small high yeh / noon
//        U+06EA..U+06ED  empty centre / rounded zero variants
//      For each suspect ayah it does a pixel-level check: render the ayah
//      and the marks-stripped version in each font, and compare ink-pixel
//      counts. A correctly-shaped combining mark contributes ~ a few px;
//      an orphan dotted-circle contributes ~ DC_pixels per orphan, which
//      is huge (50-200 px). This makes the detector immune to contextual
//      Arabic letter-shape changes.
//   3. Renders the worst suspect ayahs SIDE-BY-SIDE in BOTH fonts at large
//      size so the screenshot is the ground-truth visual evidence.

import { createServer } from "node:http";
import { readFileSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const corpus = JSON.parse(
  readFileSync(resolve(ROOT, "data/quran.json"), "utf8"),
);

const fontPaths = {
  UthmanicHafs: resolve(ROOT, "assets/fonts/UthmanicHafsV18.ttf"),
  AmiriQuran: resolve(ROOT, "assets/fonts/AmiriQuran.ttf"),
};

const PORT = 5000;

// Pre-compute on the server: for each suspect-mark codepoint, find one ayah
// that contains it. This gives us a small representative sample fast.
const SUSPECT_MARKS = [
  0x06DF, 0x06E0, 0x06D6, 0x06D7, 0x06D8, 0x06D9, 0x06DA,
  0x06DC, 0x06DD, 0x06E2, 0x06E3, 0x06E4, 0x06E7, 0x06E8,
  0x06EA, 0x06EB, 0x06EC, 0x06ED,
];
const examples = []; // { codepoint, surah, ayah, arabic }
const allOccurrences = {}; // codepoint -> [{surah,ayah}]
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
  // pick first occurrence
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
<title>Quran render check</title>
<style>
  @font-face { font-family: "UthmanicHafs"; src: url("/font/UthmanicHafs.ttf") format("truetype"); font-display: block; }
  @font-face { font-family: "AmiriQuran"; src: url("/font/AmiriQuran.ttf") format("truetype"); font-display: block; }
  body { background: #000; color: #fff; font: 14px/1.4 system-ui, -apple-system, sans-serif; margin: 0; padding: 16px; }
  h1 { font-size: 16px; margin: 0 0 8px; }
  #status { color: #fbbf24; margin-bottom: 12px; font-variant-numeric: tabular-nums; }
  #verdict { padding: 14px; margin-bottom: 12px; font-size: 18px; font-weight: 700; border-radius: 4px; }
  #verdict.good { background: #0a3a0a; color: #a3f7a3; }
  #verdict.bad  { background: #3a0a0a; color: #f7a3a3; }
  #verdict.pending { background: #1a1a1a; color: #fbbf24; }
  #report { background: #111; border: 1px solid #333; padding: 12px; white-space: pre-wrap; font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 11px; max-height: 400px; overflow: auto; }
  .row { display: grid; grid-template-columns: 110px 1fr 1fr; gap: 8px; padding: 10px; border-top: 1px solid #222; align-items: center; }
  .ref { color: #ccc; font-size: 11px; line-height: 1.5; }
  .ref b { color: #fbbf24; }
  .ar { font-size: 40px; line-height: 1.7; direction: rtl; text-align: right; padding: 10px; background: #050505; border-radius: 4px; }
  .uthmani { font-family: "UthmanicHafs"; }
  .amiri   { font-family: "AmiriQuran"; }
  .colhdr { display: grid; grid-template-columns: 110px 1fr 1fr; gap: 8px; padding: 10px; background: #1a1a1a; font-weight: 700; }
  .glyph { font-size: 80px; padding: 12px; background: #050505; border-radius: 4px; text-align: center; }
  details { margin: 8px 0; }
  summary { cursor: pointer; padding: 8px; background: #1a1a1a; border-radius: 4px; }
</style>
</head>
<body>
<h1>Quran render check — verifying U+25CC dotted-circle artefact</h1>
<div id="status">Loading fonts…</div>
<div id="verdict" class="pending">Pending…</div>

<details open><summary>Per-mark isolated render (does the font know this codepoint?)</summary>
<div class="colhdr"><div>Codepoint / Mark</div><div>UthmanicHafs (alone)</div><div>AmiriQuran (alone)</div></div>
<div id="mark-list"></div>
</details>

<details open><summary>Real-ayah examples (one per suspect mark)</summary>
<div class="colhdr"><div>Ref</div><div>UthmanicHafs (CURRENT default)</div><div>AmiriQuran (PROPOSED default)</div></div>
<div id="example-list"></div>
</details>

<details open><summary>Pixel-count verdict per example</summary>
<div id="report">(running…)</div>
</details>

<script>
const EXAMPLES = ${JSON.stringify(examples)};
function escHtml(s){ return s.replace(/[&<>]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;"})[c]); }
function pad4(cp){ return cp.toString(16).toUpperCase().padStart(4,'0'); }

const SIZE = 40;
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
      document.fonts.load(SIZE + 'px "AmiriQuran"', "ا"),
    ]);
    await document.fonts.ready;
    const haveU = document.fonts.check(SIZE + 'px "UthmanicHafs"', "ا");
    const haveA = document.fonts.check(SIZE + 'px "AmiriQuran"', "ا");
    document.getElementById("status").textContent =
      "Fonts loaded: UthmanicHafs=" + haveU + ", AmiriQuran=" + haveA + ". Examples: " + EXAMPLES.length;

    // Per-mark isolated render
    const markList = document.getElementById("mark-list");
    for (const ex of EXAMPLES) {
      const ch = String.fromCodePoint(ex.codepoint);
      // Render the mark following an ARABIC LETTER WAW so the shaper has
      // a base to attach to; if the font lacks proper attachment, U+25CC
      // appears between them.
      const probe = "و" + ch;
      const row = document.createElement("div");
      row.className = "row";
      row.innerHTML =
        '<div class="ref"><b>U+' + pad4(ex.codepoint) + '</b><br>' +
        ex.occurrences + ' ayahs<br>e.g. ' + ex.surah + ':' + ex.ayah + '</div>' +
        '<div class="glyph uthmani">' + escHtml(probe) + '</div>' +
        '<div class="glyph amiri">' + escHtml(probe) + '</div>';
      markList.appendChild(row);
    }

    // Real-ayah examples + pixel-count verdict
    const exampleList = document.getElementById("example-list");
    const reportLines = [];
    let badU = 0, badA = 0;
    const dcU = inkPixelCount("\\u25CC", "UthmanicHafs");
    const dcA = inkPixelCount("\\u25CC", "AmiriQuran");
    reportLines.push("U+25CC ink pixels — UthmanicHafs: " + dcU + ", AmiriQuran: " + dcA);
    reportLines.push("");

    for (const ex of EXAMPLES) {
      const stripped = ex.arabic.replace(new RegExp(String.fromCodePoint(ex.codepoint), "g"), "");
      const numRemoved = (ex.arabic.length - stripped.length);
      const fU = inkPixelCount(ex.arabic, "UthmanicHafs");
      const sU = inkPixelCount(stripped, "UthmanicHafs");
      const dU = fU - sU;
      const fA = inkPixelCount(ex.arabic, "AmiriQuran");
      const sA = inkPixelCount(stripped, "AmiriQuran");
      const dA = fA - sA;
      const allowance = numRemoved * 30 + 20;
      const orphansU = Math.max(0, (dU - allowance) / dcU);
      const orphansA = Math.max(0, (dA - allowance) / dcA);
      const badThisU = orphansU > 0.5;
      const badThisA = orphansA > 0.5;
      if (badThisU) badU++;
      if (badThisA) badA++;

      reportLines.push(
        ex.surah + ":" + ex.ayah +
        "  U+" + pad4(ex.codepoint) + " (×" + numRemoved + ")" +
        "  ΔpxU=" + dU + " orphansU≈" + orphansU.toFixed(2) + (badThisU ? " ❌" : " ✓") +
        "  ΔpxA=" + dA + " orphansA≈" + orphansA.toFixed(2) + (badThisA ? " ❌" : " ✓"),
      );

      const row = document.createElement("div");
      row.className = "row";
      row.innerHTML =
        '<div class="ref">' + ex.surah + ':' + ex.ayah + '<br><b>U+' + pad4(ex.codepoint) + '</b><br>' +
        '<span style="color:' + (badThisU ? '#f7a3a3' : '#a3f7a3') + '">U:' + (badThisU ? 'bad' : 'ok') + '</span><br>' +
        '<span style="color:' + (badThisA ? '#f7a3a3' : '#a3f7a3') + '">A:' + (badThisA ? 'bad' : 'ok') + '</span>' +
        '</div>' +
        '<div class="ar uthmani">' + escHtml(ex.arabic) + '</div>' +
        '<div class="ar amiri">' + escHtml(ex.arabic) + '</div>';
      exampleList.appendChild(row);
    }
    document.getElementById("report").textContent = reportLines.join("\\n");

    const v = document.getElementById("verdict");
    if (badU === 0 && badA === 0) {
      v.className = "good";
      v.textContent = "VERDICT: Both fonts handle every suspect Quranic mark cleanly.";
    } else if (badA === 0 && badU > 0) {
      v.className = "good";
      v.textContent =
        "VERDICT: AmiriQuran is CLEAN on every suspect mark. UthmanicHafs misrenders " +
        badU + "/" + EXAMPLES.length + " — switch the default verse font to AmiriQuran.";
    } else {
      v.className = "bad";
      v.textContent = "VERDICT: UthmanicHafs bad=" + badU + ", AmiriQuran bad=" + badA;
    }
    document.getElementById("status").textContent = "Done. Examples: " + EXAMPLES.length + " — UthmanicHafs bad: " + badU + ", AmiriQuran bad: " + badA;
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
    const name = req.url.slice("/font/".length).replace(/\?.*$/, "").replace(".ttf","");
    const p = fontPaths[name];
    if (!p) { res.writeHead(404); res.end(); return; }
    const stat = statSync(p);
    res.writeHead(200, {
      "Content-Type": "font/ttf",
      "Content-Length": stat.size,
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
    });
    res.end(readFileSync(p));
    return;
  }
  res.writeHead(404); res.end();
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`render-check server listening on http://localhost:${PORT}`);
  console.log(`Found ${examples.length} suspect-mark examples in corpus`);
});
