import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import {
  Platform,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";

interface GlassCardProps {
  children?: React.ReactNode;
  style?: ViewStyle;
  intensity?: number;
  tint?: "light" | "dark" | "default" | "extraLight" | "systemMaterial" | "systemThickMaterial" | "systemThinMaterial" | "systemUltraThinMaterial" | "systemChromeMaterial" | "systemChromeMaterialDark" | "systemChromeMaterialLight";
  title?: string;
}

export function GlassCard({
  children,
  style,
  intensity = 60,
  tint = "systemThinMaterial",
  title,
}: GlassCardProps) {
  // On Android, BlurView has limited support — fall back to semi-transparent overlay
  if (Platform.OS === "android") {
    return (
      <View style={[styles.card, styles.androidFallback, style]}>
        {title && <Text style={styles.title}>{title}</Text>}
        {children}
      </View>
    );
  }

  return (
    <BlurView intensity={intensity} tint={tint} style={[styles.card, style]}>
      <LinearGradient
        colors={["rgba(255,255,255,0.25)", "rgba(255,255,255,0.05)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.border} pointerEvents="none" />
      {title && <Text style={styles.title}>{title}</Text>}
      {children}
    </BlurView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    overflow: "hidden",
    padding: 20,
  },
  androidFallback: {
    backgroundColor: "rgba(255, 255, 255, 0.18)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.35)",
  },
  border: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.4)",
  },
  title: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 8,
    letterSpacing: 0.3,
  },
});
