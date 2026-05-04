/**
 * AudioBars — Apple Music-style animated equalizer bars.
 *
 * Three vertical bars oscillate at different frequencies when `playing` is
 * true, mimicking the "Now Playing" indicator in Apple Music and the iOS Lock
 * Screen media widget.  When paused the bars gracefully settle to their resting
 * height so the motion reads as intentional silence, not an error.
 *
 * Implementation notes
 * ────────────────────
 * • Heights are animated with `useNativeDriver: false`.  We cannot use the
 *   native driver for layout-property animations (`height`), but three tiny
 *   bars at ~12 px max impose negligible JS-thread cost.
 * • Each bar starts at a different height so they look organically offset from
 *   frame one — no "all rise at the same time" artefact on first render.
 * • Easing.inOut(Easing.quad) gives a smooth parabolic curve that matches the
 *   sinusoidal feel of Apple's implementation without needing a full sine wave.
 */

import React, { useEffect, useRef } from "react";
import { Animated, Easing, View } from "react-native";

interface Props {
  playing: boolean;
  color?:  string;
}

const BAR_MAX  = 12;
const BAR_REST = 3;
const BAR_W    = 2.5;
const BAR_GAP  = 2.5;
const BAR_R    = 1.5;

// Each bar: up-duration, down-duration, and initial height.
// Different up/down splits + initial values create the illusion of
// independent oscillators without any phase-offset scheduling.
const CONFIGS = [
  { upMs: 420, downMs: 380, initH: BAR_REST },
  { upMs: 500, downMs: 500, initH: 10       },
  { upMs: 340, downMs: 420, initH: 6        },
] as const;

export function AudioBars({ playing, color = "#e8c078" }: Props) {
  const heights = useRef(
    CONFIGS.map((c) => new Animated.Value(c.initH))
  ).current;

  // Keep a ref to the running loops so we can stop them on cleanup / pause.
  const loopsRef = useRef<Animated.CompositeAnimation[]>([]);

  useEffect(() => {
    // Stop any previous loops before starting new ones.
    loopsRef.current.forEach((a) => a.stop());

    if (playing) {
      loopsRef.current = heights.map((h, i) => {
        const { upMs, downMs } = CONFIGS[i];
        const loop = Animated.loop(
          Animated.sequence([
            Animated.timing(h, {
              toValue:          BAR_MAX,
              duration:         upMs,
              easing:           Easing.inOut(Easing.quad),
              useNativeDriver:  false,
            }),
            Animated.timing(h, {
              toValue:          BAR_REST,
              duration:         downMs,
              easing:           Easing.inOut(Easing.quad),
              useNativeDriver:  false,
            }),
          ])
        );
        loop.start();
        return loop;
      });
    } else {
      // Settle gently when paused.
      loopsRef.current = [];
      heights.forEach((h) =>
        Animated.timing(h, {
          toValue:          BAR_REST,
          duration:         260,
          easing:           Easing.out(Easing.quad),
          useNativeDriver:  false,
        }).start()
      );
    }

    return () => loopsRef.current.forEach((a) => a.stop());
  }, [playing]);

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems:    "flex-end",
        gap:           BAR_GAP,
        height:        BAR_MAX,
        marginRight:   5,
      }}
    >
      {heights.map((h, i) => (
        <Animated.View
          key={i}
          style={{
            width:           BAR_W,
            height:          h,
            borderRadius:    BAR_R,
            backgroundColor: color,
          }}
        />
      ))}
    </View>
  );
}
