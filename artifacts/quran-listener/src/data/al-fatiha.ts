export interface Ayah {
  number: number;
  arabic: string;
  translation: string;
  audioUrl: string;
}

const audio = (n: number) =>
  `https://cdn.islamic.network/quran/audio/128/ar.alafasy/${n}.mp3`;

// Convert a Western digit number into Arabic-Indic digits (e.g. 12 -> ١٢)
const toArabicIndic = (n: number): string => {
  const digits = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
  return String(n)
    .split("")
    .map((d) => digits[Number(d)])
    .join("");
};

// U+06DD ARABIC END OF AYAH — the KFGQPC font renders this followed by
// Arabic-Indic digits as the decorative rosette/ornament containing the
// verse number, exactly as it appears in the printed Mushaf.
export const ayahMarker = (n: number): string =>
  `\u06DD${toArabicIndic(n)}`;

export const surahName = "Al-Fatiha";
export const surahNameArabic = "الفاتحة";
export const surahMeaning = "The Opening";
export const reciter = "Mishary Rashid Alafasy";

export const ayahs: Ayah[] = [
  {
    number: 1,
    arabic: "بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ",
    translation:
      "In the name of Allah, the Entirely Merciful, the Especially Merciful.",
    audioUrl: audio(1),
  },
  {
    number: 2,
    arabic: "ٱلْحَمْدُ لِلَّهِ رَبِّ ٱلْعَـٰلَمِينَ",
    translation: "All praise is due to Allah, Lord of the worlds.",
    audioUrl: audio(2),
  },
  {
    number: 3,
    arabic: "ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ",
    translation: "The Entirely Merciful, the Especially Merciful.",
    audioUrl: audio(3),
  },
  {
    number: 4,
    arabic: "مَـٰلِكِ يَوْمِ ٱلدِّينِ",
    translation: "Sovereign of the Day of Recompense.",
    audioUrl: audio(4),
  },
  {
    number: 5,
    arabic: "إِيَّاكَ نَعْبُدُ وَإِيَّاكَ نَسْتَعِينُ",
    translation: "It is You we worship and You we ask for help.",
    audioUrl: audio(5),
  },
  {
    number: 6,
    arabic: "ٱهْدِنَا ٱلصِّرَٰطَ ٱلْمُسْتَقِيمَ",
    translation: "Guide us to the straight path —",
    audioUrl: audio(6),
  },
  {
    number: 7,
    arabic:
      "صِرَٰطَ ٱلَّذِينَ أَنْعَمْتَ عَلَيْهِمْ غَيْرِ ٱلْمَغْضُوبِ عَلَيْهِمْ وَلَا ٱلضَّآلِّينَ",
    translation:
      "The path of those upon whom You have bestowed favor, not of those who have evoked Your anger or of those who are astray.",
    audioUrl: audio(7),
  },
];
