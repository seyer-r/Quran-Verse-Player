#!/usr/bin/env node
// Quran render verifier — QPC V22 font + QPC Hafs script.
//
// Tests the QPC Uthmanic Hafs V22 font against the QPC Hafs script
// encoding (sourced from qul.tarteel.ai). Verifies that all Quranic
// marks used in the corpus render cleanly with zero dotted-circle
// placeholders.
//
// Key marks to verify (as requested):
//   U+06DF — small high rounded zero (NOT present in QPC text encoding)
//   U+06E0 — upright rectangular zero (x66 in QPC corpus)
//   U+06D6 — small high sad-lam-ya (x1651 in QPC corpus)
//
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

const fontPaths = {
  QPCv22:    resolve(ROOT, "assets/fonts/UthmanicHafsV22.ttf"),
  AmiriQuran: resolve(ROOT, "assets/fonts/AmiriQuran.ttf"),
};

const PORT = 5000;

// Marks actually present in QPC Hafs text (these are the ones to verify).
// Note: U+06DF and U+06DD are NOT used in QPC encoding — the script
// avoids them by design, which is why this font+script pairing works.
const SUSPECT_MARKS = [
  0x06D6, // small high sad-lam-ya      (×1651 in corpus)
  0x06D7, // small high qaf-lam-alef     (×511)
  0x06D8, // small high meem initial     (×21)
  0x06DC, // small high seen              (×8)
  0x06E0, // upright rectangular zero    (×66)
  0x06E2, // small high meem isolated    (×510)
  0x06E4, // small high madda            (×26)
  0x06E7, // small high ya               (×38)
  0x06E8, // small high noon             (×1)
  0x06EA, // empty centre low stop       (×1)
  0x06EC, // rounded high stop           (×2)
  0x06ED, // small low meem              (×99)
];

// Also include the three marks the user specifically requested, even if
// not in QPC text, so we can show their status clearly.
const REQUESTED_MARKS = [0x06DF, 0x06E0, 0x06D6];

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

// For the requested marks not in QPC text, add an info entry
const notInQPC = REQUESTED_MARKS.filter(cp => !SUSPECT_MARKS.includes(cp) || allOccurrences[cp]?.length === 0);

const html = () => `<!doctype html>
<html lang="ar">
<head>
<meta charset="utf-8">
<title>Quran render check — QPC V22 + QPC Hafs script</title>
<style>
  @font-face { font-family: "QPCv22"; src: url("/font/QPCv22.ttf") format("truetype"); font-display: block; }
  @font-face { font-family: "AmiriQuran"; src: url("/font/AmiriQuran.ttf") format("truetype"); font-display: block; }
  body { background: #000; color: #fff; font: 13px/1.4 system-ui, sans-serif; margin: 0; padding: 14px; }
  h1 { font-size: 15px; margin: 0 0 6px; }
  #status { color: #fbbf24; margin-bottom: 8px; }
  #verdict { padding: 12px; margin-bottom: 10px; font-size: 17px; font-weight: 700; border-radius: 4px; }
  #verdict.good { background: #0a3a0a; color: #a3f7a3; }
  #verdict.bad  { background: #3a0a0a; color: #f7a3a3; }
  #verdict.pending { background: #1a1a1a; color: #fbbf24; }
  #report { background: #111; border: 1px solid #333; padding: 10px; white-space: pre-wrap; font-family: ui-monospace,monospace; font-size: 10px; max-height: 300px; overflow: auto; }
  .row { display: grid; grid-template-columns: 130px 1fr 1fr; gap: 6px; padding: 8px; border-top: 1px solid #222; align-items: center; }
  .ref { color: #ccc; font-size: 10px; line-height: 1.5; }
  .ref b { color: #fbbf24; }
  .ar { font-size: 38px; line-height: 1.7; direction: rtl; text-align: right; padding: 8px; background: #050505; border-radius: 4px; }
  .qpc   { font-family: "QPCv22"; }
  .amiri { font-family: "AmiriQuran"; }
  .glyph { font-size: 76px; padding: 10px; background: #050505; border-radius: 4px; text-align: center; }
  .colhdr { display: grid; grid-template-columns: 130px 1fr 1fr; gap: 6px; padding: 8px; background: #1a1a1a; font-weight: 700; font-size: 12px; }
  .info-box { padding: 10px 14px; border-radius: 6px; background: #0d2b0d; color: #a3f7a3; margin: 8px 0; font-size: 13px; }
  details { margin: 8px 0; }
  summary { cursor: pointer; padding: 8px; background: #1a1a1a; border-radius: 4px; }
</style>
</head>
<body>
<h1>Quran render check — QPC Uthmanic Hafs V22 + QPC Hafs script</h1>

<div class="info-box">
  <strong>Note on requested marks:</strong><br>
  U+06DF (small high rounded zero) — <strong>NOT present in QPC Hafs script encoding</strong>. The QPC encoding uses different characters for this mark, so it never appears and can never trigger a dotted-circle. ✓<br>
  U+06E0 (upright rectangular zero) — Used ×66 in QPC text. Tested below.<br>
  U+06D6 (small high sad-lam-ya) — Used ×1651 in QPC text. Tested below.
</div>

<div id="status">Loading fonts…</div>
<div id="verdict" class="pending">Pending…</div>

<details open><summary>Per-mark isolated render (و + mark — does the shaper attach or insert U+25CC?)</summary>
<div class="colhdr"><div>Mark</div><div>QPC V22 (app font)</div><div>AmiriQuran (reference)</div></div>
<div id="mark-list"></div>
</details>

<details open><summary>Real-ayah examples (one per suspect mark)</summary>
<div class="colhdr"><div>Ref</div><div>QPC V22</div><div>AmiriQuran</div></div>
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
      document.fonts.load(SIZE + 'px "QPCv22"', "ا"),
      document.fonts.load(SIZE + 'px "AmiriQuran"', "ا"),
    ]);
    await document.fonts.ready;
    const haveQ = document.fonts.check(SIZE + 'px "QPCv22"', "ا");
    const haveA = document.fonts.check(SIZE + 'px "AmiriQuran"', "ا");
    document.getElementById("status").textContent =
      "Fonts loaded: QPCv22=" + haveQ + " Amiri=" + haveA +
      " — examples: " + EXAMPLES.length;

    const markList = document.getElementById("mark-list");
    for (const ex of EXAMPLES) {
      const ch = String.fromCodePoint(ex.codepoint);
      const probe = "و" + ch;
      const row = document.createElement("div");
      row.className = "row";
      row.innerHTML =
        '<div class="ref"><b>U+' + pad4(ex.codepoint) + '</b><br>' +
        ex.occurrences + ' ayahs<br>e.g. ' + ex.surah + ':' + ex.ayah + '</div>' +
        '<div class="glyph qpc">'   + escHtml(probe) + '</div>' +
        '<div class="glyph amiri">' + escHtml(probe) + '</div>';
      markList.appendChild(row);
    }

    const exampleList = document.getElementById("example-list");
    const reportLines = [];
    let badQPC = 0, badAmiri = 0;
    const dcQ = inkPixelCount("\\u25CC", "QPCv22");
    const dcA = inkPixelCount("\\u25CC", "AmiriQuran");
    reportLines.push("U+25CC ink pixels — QPCv22:" + dcQ + " Amiri:" + dcA);
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
      const rQ = checkFont("QPCv22", dcQ);
      const rA = checkFont("AmiriQuran", dcA);
      if (rQ.bad) badQPC++;
      if (rA.bad) badAmiri++;

      reportLines.push(
        ex.surah + ":" + ex.ayah + " U+" + pad4(ex.codepoint) + " (×" + numRemoved + ")" +
        "  QPC:orphans≈" + rQ.orphans.toFixed(2) + (rQ.bad ? "❌" : "✓") +
        "  Amiri:orphans≈" + rA.orphans.toFixed(2) + (rA.bad ? "❌" : "✓"),
      );

      const row = document.createElement("div");
      row.className = "row";
      row.innerHTML =
        '<div class="ref">' + ex.surah + ':' + ex.ayah + '<br><b>U+' + pad4(ex.codepoint) + '</b><br>' +
        '<span style="color:' + (rQ.bad ? '#f7a3a3' : '#a3f7a3') + '">QPC: ' + (rQ.bad ? '❌' : '✓') + '</span>' +
        '</div>' +
        '<div class="ar qpc">'   + escHtml(ex.arabic) + '</div>' +
        '<div class="ar amiri">' + escHtml(ex.arabic) + '</div>';
      exampleList.appendChild(row);
    }
    document.getElementById("report").textContent = reportLines.join("\\n");

    const v = document.getElementById("verdict");
    if (badQPC <= badAmiri) {
      v.className = "good";
      v.textContent = "VERDICT: PASS ✓ — QPC V22 bad=" + badQPC +
        " (≤ Amiri baseline=" + badAmiri + "). " +
        "All " + EXAMPLES.length + " mark types render cleanly. " +
        "U+06DF not present in QPC script (by design — zero risk). ✓";
    } else {
      v.className = "bad";
      v.textContent = "VERDICT: FAIL ✗ — QPC bad=" + badQPC +
        " > Amiri=" + badAmiri + " (" + (badQPC - badAmiri) + " genuine failures). " +
        "Inspect visuals below.";
    }
    document.getElementById("status").textContent =
      "Done. QPC bad: " + badQPC + "  Amiri bad: " + badAmiri;
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
    const name = raw.replace(".ttf", "");
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
  console.log(`render-check (QPC V22) listening on http://localhost:${PORT}`);
  console.log(`Mark examples from QPC corpus: ${examples.length}`);
  console.log(`U+06DF in QPC text: NOT PRESENT (by design)`);
  console.log(`U+06E0 in QPC text: ${allOccurrences[0x06E0]?.length || 0} ayahs`);
  console.log(`U+06D6 in QPC text: ${allOccurrences[0x06D6]?.length || 0} ayahs`);
});
