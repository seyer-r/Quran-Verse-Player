export type ReciterId = "alafasy" | "hudhaify" | "maher" | "shatri" | "husary";

export interface ReciterOption {
  id: ReciterId;
  name: string;
  cdnIdentifier: string;
  /** Recitation ID used by the Quran Foundation Audio API (api.quran.com). */
  qfRecitationId: number;
}

export const RECITERS: ReciterOption[] = [
  {
    id: "alafasy",
    name: "Mishary Rashid Alafasy",
    cdnIdentifier: "ar.alafasy",
    qfRecitationId: 7,
  },
  {
    id: "hudhaify",
    name: "Ali Al-Hudhaify",
    cdnIdentifier: "ar.hudhaify",
    qfRecitationId: 4,
  },
  {
    id: "maher",
    name: "Maher Al-Muaiqly",
    cdnIdentifier: "ar.mahermuaiqly",
    qfRecitationId: 12,
  },
  {
    id: "shatri",
    name: "Abu Bakr Al-Shatri",
    cdnIdentifier: "ar.shaatree",
    qfRecitationId: 2,
  },
  {
    id: "husary",
    name: "Mahmoud Khalil Al-Hussary",
    cdnIdentifier: "ar.husary",
    qfRecitationId: 9,
  },
];

export const DEFAULT_RECITER: ReciterId = "alafasy";

export const getReciter = (id: ReciterId): ReciterOption =>
  RECITERS.find((r) => r.id === id) ?? RECITERS[0];
