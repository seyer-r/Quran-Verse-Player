export type ReciterId = "alafasy" | "hudhaify" | "maher" | "shatri" | "husary";

export interface ReciterOption {
  id: ReciterId;
  name: string;
  cdnIdentifier: string;
}

export const RECITERS: ReciterOption[] = [
  {
    id: "alafasy",
    name: "Mishary Rashid Alafasy",
    cdnIdentifier: "ar.alafasy",
  },
  {
    id: "hudhaify",
    name: "Ali Al-Hudhaify",
    cdnIdentifier: "ar.hudhaify",
  },
  {
    id: "maher",
    name: "Maher Al-Muaiqly",
    cdnIdentifier: "ar.mahermuaiqly",
  },
  {
    id: "shatri",
    name: "Abu Bakr Al-Shatri",
    cdnIdentifier: "ar.shaatree",
  },
  {
    id: "husary",
    name: "Mahmoud Khalil Al-Hussary",
    cdnIdentifier: "ar.husary",
  },
];

export const DEFAULT_RECITER: ReciterId = "alafasy";

export const getReciter = (id: ReciterId): ReciterOption =>
  RECITERS.find((r) => r.id === id) ?? RECITERS[0];
