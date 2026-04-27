import { Feather } from "@expo/vector-icons";
import React, { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  TRANSITIONS,
  type TransitionMode,
} from "@/lib/transitions";

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
  transition: TransitionMode;
  onTransitionChange: (mode: TransitionMode) => void;
}

export function SettingsPanel({
  open,
  onClose,
  transition,
  onTransitionChange,
}: SettingsPanelProps) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const panelWidth = Math.min(420, width);
  const slide = useRef(new Animated.Value(panelWidth)).current;
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(slide, {
        toValue: open ? 0 : panelWidth,
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(fade, {
        toValue: open ? 1 : 0,
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [open, panelWidth, slide, fade]);

  const topInset = Platform.OS === "web" ? Math.max(insets.top, 24) : insets.top;
  const bottomInset = Platform.OS === "web" ? Math.max(insets.bottom, 24) : insets.bottom;

  return (
    <Modal
      visible={open}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={StyleSheet.absoluteFill}>
        <Animated.View
          style={[StyleSheet.absoluteFill, { opacity: fade }]}
          pointerEvents={open ? "auto" : "none"}
        >
          <Pressable
            style={[StyleSheet.absoluteFill, styles.backdrop]}
            onPress={onClose}
            accessibilityLabel="Close settings backdrop"
          />
        </Animated.View>

        <Animated.View
          style={[
            styles.panel,
            {
              width: panelWidth,
              transform: [{ translateX: slide }],
            },
          ]}
          accessibilityViewIsModal
          accessibilityLabel="Settings"
        >
          <View
            style={[
              styles.header,
              { paddingTop: topInset + 12 },
            ]}
          >
            <Text style={styles.headerTitle}>SETTINGS</Text>
            <TouchableOpacity
              onPress={onClose}
              accessibilityLabel="Close settings"
              hitSlop={12}
              style={styles.closeBtn}
            >
              <Feather name="x" size={20} color="#a3a3a3" />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.body}
            contentContainerStyle={{ paddingBottom: bottomInset + 24 }}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.sectionTitle}>Ayah transition</Text>
            <Text style={styles.sectionSubtitle}>
              How verses fade from one to the next.
            </Text>

            <View style={styles.optionList}>
              {TRANSITIONS.map((t) => {
                const selected = t.id === transition;
                return (
                  <TouchableOpacity
                    key={t.id}
                    onPress={() => onTransitionChange(t.id)}
                    activeOpacity={0.75}
                    style={[
                      styles.option,
                      {
                        borderColor: selected
                          ? "rgba(255,255,255,0.4)"
                          : "rgba(255,255,255,0.08)",
                        backgroundColor: selected
                          ? "rgba(255,255,255,0.06)"
                          : "transparent",
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.radio,
                        {
                          borderColor: selected
                            ? "rgba(255,255,255,0.9)"
                            : "rgba(255,255,255,0.25)",
                        },
                      ]}
                    >
                      {selected && <View style={styles.radioDot} />}
                    </View>
                    <View style={styles.optionTextWrap}>
                      <Text style={styles.optionLabel}>{t.label}</Text>
                      <Text style={styles.optionDescription}>
                        {t.description}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  panel: {
    position: "absolute",
    top: 0,
    bottom: 0,
    right: 0,
    backgroundColor: "#0a0a0a",
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: "rgba(255,255,255,0.1)",
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 24,
    shadowOffset: { width: -8, height: 0 },
    elevation: 24,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  headerTitle: {
    fontSize: 11,
    letterSpacing: 4,
    color: "#a3a3a3",
    fontWeight: "500",
  },
  closeBtn: {
    padding: 6,
    borderRadius: 999,
  },
  body: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "500",
    color: "#e5e5e5",
  },
  sectionSubtitle: {
    fontSize: 12,
    color: "#737373",
    marginTop: 4,
  },
  optionList: {
    marginTop: 20,
    gap: 8,
  },
  option: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  radio: {
    marginTop: 4,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  radioDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#fff",
  },
  optionTextWrap: {
    flex: 1,
  },
  optionLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: "#f5f5f5",
  },
  optionDescription: {
    fontSize: 12,
    color: "#737373",
    marginTop: 2,
  },
});
