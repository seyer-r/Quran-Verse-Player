export type TransitionMode = "instant" | "crossfade";

export interface TransitionConfig {
  id: TransitionMode;
  label: string;
  description: string;
}

/**
 * Binary transition options. The old multi-speed picker is replaced with a
 * simple on/off toggle:
 *
 *   crossfade — the current verse fades OUT completely over
 *               CROSSFADE_DURATION_MS, then the next verse fades IN over
 *               the same duration. The two verses are never simultaneously
 *               visible. This is the default.
 *
 *   instant   — verses snap with no animation.
 */
export const TRANSITIONS: TransitionConfig[] = [
  {
    id: "crossfade",
    label: "Crossfade",
    description:
      "Current verse fades out completely, then the next fades in. The two are never visible at the same time.",
  },
  {
    id: "instant",
    label: "Instant",
    description: "Verses snap immediately with no animation.",
  },
];

export const DEFAULT_TRANSITION: TransitionMode = "crossfade";

/**
 * Duration in milliseconds for each leg of the sequential crossfade:
 *   leg 1 — outgoing verse fades from opacity 1 → 0
 *   leg 2 — incoming verse fades from opacity 0 → 1
 * Total elapsed time = 2 × CROSSFADE_DURATION_MS with a brief hold at black
 * in between while React commits the displayedIndex update.
 */
export const CROSSFADE_DURATION_MS = 700;

export const getTransition = (id: TransitionMode): TransitionConfig =>
  TRANSITIONS.find((t) => t.id === id) ?? TRANSITIONS[0];
