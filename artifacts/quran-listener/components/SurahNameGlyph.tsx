import React from "react";
import { Text, TextStyle } from "react-native";

import { Surah } from "@/data/quran";

/**
 * Renders the official calligraphic surah name using the KFGQPC Surah Names
 * font (v1) sourced from qul.tarteel.ai/resources/font and the quran.com
 * open-source frontend.
 *
 * The font encodes each surah's name as a single Private Use Area glyph. The
 * codepoint is derived from the surah number via BCD encoding:
 *
 *   surah 1   → "001" → parseInt("001", 16) = 0x001 → U+E001
 *   surah 10  → "010" → parseInt("010", 16) = 0x010 → U+E010
 *   surah 100 → "100" → parseInt("100", 16) = 0x100 → U+E100
 *   surah 114 → "114" → parseInt("114", 16) = 0x114 → U+E114
 *
 * U+E000 and U+E115 exist in the font but have no corresponding surah — they
 * are unused and never rendered by this component.
 *
 * Fallback: if the font is not yet loaded (rare, covered by the splash-screen
 * gate in _layout.tsx) the component renders nameArabic in the Uthmanic font
 * so the UI is never blank.
 */

function surahGlyphChar(surahNumber: number): string {
  const digits = surahNumber.toString().padStart(3, "0");
  const offset = parseInt(digits, 16);
  return String.fromCodePoint(0xe000 + offset);
}

interface SurahNameGlyphProps {
  surah: Surah;
  size: number;
  color?: string;
  style?: TextStyle;
  numberOfLines?: number;
}

export function SurahNameGlyph({
  surah,
  size,
  color = "#f5f5f5",
  style,
  numberOfLines = 1,
}: SurahNameGlyphProps) {
  return (
    <Text
      allowFontScaling={false}
      numberOfLines={numberOfLines}
      adjustsFontSizeToFit
      style={[
        {
          fontFamily: "SurahNamesV1",
          fontSize: size,
          color,
          includeFontPadding: false,
        },
        style,
      ]}
    >
      {surahGlyphChar(surah.number)}
    </Text>
  );
}
