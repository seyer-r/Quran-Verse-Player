import { GlassCard } from "@/components/GlassCard";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function GlassTestScreen() {
  const insets = useSafeAreaInsets();

  return (
    <LinearGradient
      colors={["#1a0a2e", "#16213e", "#0f3460"]}
      style={styles.container}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 },
        ]}
      >
        <Text style={styles.heading}>Liquid Glass Test</Text>

        <GlassCard title="Light Tint" tint="light" intensity={50} style={styles.card}>
          <Text style={styles.body}>
            This uses expo-blur BlurView with a light tint and gradient overlay.
          </Text>
        </GlassCard>

        <GlassCard title="System Material" tint="systemMaterial" intensity={70} style={styles.card}>
          <Text style={styles.body}>
            systemMaterial matches the native iOS frosted glass look.
          </Text>
        </GlassCard>

        <GlassCard title="Thin Material" tint="systemThinMaterial" intensity={40} style={styles.card}>
          <Text style={styles.body}>
            Thinner blur — more transparent, closer to the iOS 26 Liquid Glass style.
          </Text>
          <View style={styles.row}>
            <GlassCard tint="light" intensity={80} style={styles.pill}>
              <Text style={styles.pillText}>Nested glass</Text>
            </GlassCard>
          </View>
        </GlassCard>

        <GlassCard title="Dark Tint" tint="dark" intensity={60} style={styles.card}>
          <Text style={styles.body}>Dark variant for dark backgrounds.</Text>
        </GlassCard>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    paddingHorizontal: 20,
    gap: 16,
  },
  heading: {
    color: "#ffffff",
    fontSize: 28,
    fontWeight: "700",
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  card: {
    gap: 8,
  },
  body: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 14,
    lineHeight: 20,
  },
  row: {
    flexDirection: "row",
    marginTop: 8,
  },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 100,
  },
  pillText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "500",
  },
});
