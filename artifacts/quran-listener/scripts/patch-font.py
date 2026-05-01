#!/usr/bin/env python3
"""
patch-font.py — Fix the U+25CC dotted-circle rendering bug in UthmanicHafs v18.

Root cause (three separate defects in the font for glyph uni06DF / U+06DF):
  1. GDEF GlyphClassDef: uni06DF was classified as BASE (class 1) — HarfBuzz
     will never treat it as a combining mark in any shaping context.
  2. GPOS MarkToBase lookups: uni06DF was absent from all MarkCoverage tables
     — even if GDEF were fixed the shaper had no attachment anchors.
  3. Glyph outline: uni06DF was a composite reference to uni0600 at 1:1 scale
     with advance=1442, drawing at 61% UPM height. Even with GPOS active the
     glyph would appear as a large circle rather than a small superscript mark.

Fix applied here:
  1. GDEF: classDefs['uni06DF'] = 3 (MARK)
  2. GPOS: insert uni06DF into MarkCoverage of every MarkToBase lookup that
     contains uni06E0, using class=0 and anchors cloned from uni06E0.
  3. Glyph: decompose the composite via fontTools pens, apply a transform
     (scale=0.20, translate to superscript zone center (300,750)), replace
     the glyph as a simple outline, and set advance=0.

Usage:
    pip install fonttools
    python3 patch-font.py \\
        assets/fonts/UthmanicHafsV18.ttf \\
        assets/fonts/UthmanicHafsV18.ttf   # in-place ok
"""

import sys, copy
from fontTools.ttLib import TTFont
from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.ttGlyphPen import TTGlyphPen

def patch(src: str, dst: str) -> None:
    tt = TTFont(src)
    glyf_tbl = tt['glyf']
    hmtx_tbl = tt['hmtx']

    # ── 1. Rescale + reposition the glyph ──────────────────────────────────
    SCALE = 0.20
    CX, CY = 724, 418     # approximate centre of original bbox (96,-210,1351,1045)
    TX, TY = 300, 750     # target centre in superscript zone
    dx = TX - SCALE * CX
    dy = TY - SCALE * CY
    transform = (SCALE, 0, 0, SCALE, dx, dy)

    glyphset = tt.getGlyphSet()
    recorder = DecomposingRecordingPen(glyphset)
    glyphset['uni06DF'].draw(TransformPen(recorder, transform))

    pen = TTGlyphPen(glyphSet=glyphset)
    recorder.replay(pen)
    new_glyph = pen.glyph()
    new_glyph.recalcBounds(glyf_tbl)

    glyf_tbl['uni06DF'] = new_glyph
    hmtx_tbl['uni06DF'] = (0, new_glyph.xMin)

    # ── 2. GDEF: BASE → MARK ────────────────────────────────────────────────
    tt['GDEF'].table.GlyphClassDef.classDefs['uni06DF'] = 3

    # ── 3. GPOS: add to all MarkToBase lookups that cover uni06E0 ──────────
    MARK_NEW = 'uni06DF'
    MARK_MODEL = 'uni06E0'
    gpos = tt['GPOS'].table
    for lk in gpos.LookupList.Lookup:
        if lk.LookupType != 4:
            continue
        sub = lk.SubTable[0]
        mc = sub.MarkCoverage.glyphs
        if MARK_MODEL not in mc or MARK_NEW in mc:
            continue
        idx = mc.index(MARK_MODEL)
        rec = copy.deepcopy(sub.MarkArray.MarkRecord[idx])
        mc.insert(idx, MARK_NEW)
        sub.MarkArray.MarkRecord.insert(idx, rec)
        sub.MarkArray.MarkCount = len(sub.MarkArray.MarkRecord)

    tt.save(dst)
    print(f"Saved: {dst}")
    print(f"  uni06DF bbox: ({new_glyph.xMin},{new_glyph.yMin},{new_glyph.xMax},{new_glyph.yMax})")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    patch(sys.argv[1], sys.argv[2])
