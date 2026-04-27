export type TransitionMode =
  | "instant"
  | "quick"
  | "smooth"
  | "slow"
  | "blackout";

export interface TransitionConfig {
  id: TransitionMode;
  label: string;
  description: string;
  duration: number;
  throughBlack: boolean;
}

export const TRANSITIONS: TransitionConfig[] = [
  {
    id: "instant",
    label: "Instant",
    description: "No animation — verses snap immediately",
    duration: 0,
    throughBlack: false,
  },
  {
    id: "quick",
    label: "Quick",
    description: "Brief 350 ms crossfade",
    duration: 350,
    throughBlack: false,
  },
  {
    id: "smooth",
    label: "Smooth",
    description: "Gentle 1.1 s crossfade",
    duration: 1100,
    throughBlack: false,
  },
  {
    id: "slow",
    label: "Slow",
    description: "Deliberate 2 s crossfade",
    duration: 2000,
    throughBlack: false,
  },
  {
    id: "blackout",
    label: "Through black",
    description: "Fade fully to black, then fade in the next ayah",
    duration: 1600,
    throughBlack: true,
  },
];

export const DEFAULT_TRANSITION: TransitionMode = "smooth";

export const getTransition = (id: TransitionMode): TransitionConfig =>
  TRANSITIONS.find((t) => t.id === id) ?? TRANSITIONS[2];
