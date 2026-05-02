import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";

const SIZE = 52;
const STROKE = 2.5;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

type Props = {
  remainingMs: number;
  durationMin: number;
  onCancel: () => void;
};

export function SleepTimerRing({ remainingMs, durationMin, onCancel }: Props) {
  const fraction = Math.max(
    0,
    Math.min(1, remainingMs / (durationMin * 60_000)),
  );
  const dashOffset = CIRCUMFERENCE * (1 - fraction);

  const totalSec = Math.max(0, Math.ceil(remainingMs / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  const label = `${m}:${s.toString().padStart(2, "0")}`;

  return (
    <Pressable
      onPress={onCancel}
      style={styles.wrap}
      accessibilityLabel={`Sleep timer: ${label} remaining. Tap to cancel.`}
      hitSlop={8}
    >
      <View style={styles.ring} pointerEvents="none">
        <Svg width={SIZE} height={SIZE}>
          {/* Track ring */}
          <Circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            stroke="rgba(232,192,120,0.18)"
            strokeWidth={STROKE}
            fill="none"
          />
          {/* Progress ring — counter-clockwise depletion, starts at 12 o'clock */}
          <Circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            stroke="#e8c078"
            strokeWidth={STROKE}
            fill="none"
            strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            rotation={-90}
            origin={`${SIZE / 2}, ${SIZE / 2}`}
          />
        </Svg>
      </View>

      <View style={styles.label} pointerEvents="none">
        <Text style={styles.moonGlyph}>☽</Text>
        <Text style={styles.countdown}>{label}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: SIZE,
    height: SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  ring: {
    position: "absolute",
    top: 0,
    left: 0,
    width: SIZE,
    height: SIZE,
  },
  label: {
    alignItems: "center",
    gap: 1,
  },
  moonGlyph: {
    fontSize: 10,
    color: "#e8c078",
    lineHeight: 12,
  },
  countdown: {
    fontSize: 9,
    color: "#e8c078",
    fontWeight: "600",
    letterSpacing: -0.3,
    lineHeight: 11,
  },
});
