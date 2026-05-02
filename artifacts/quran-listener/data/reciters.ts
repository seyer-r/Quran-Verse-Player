export type ReciterId = "alafasy" | "sudais" | "ghamdi" | "shatri" | "husary";

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
    id: "sudais",
    name: "Abdul Rahman Al-Sudais",
    cdnIdentifier: "ar.abdurrahmansudais",
  },
  {
    id: "ghamdi",
    name: "Saad Al-Ghamdi",
    cdnIdentifier: "ar.saadalghamdi",
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
