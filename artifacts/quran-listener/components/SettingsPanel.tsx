import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import React, { useEffect, useRef, useState } from "react";
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
  AMBIENT_OPTIONS,
  type AmbientId,
} from "@/data/ambient";
import {
  BACKGROUND_OPTIONS,
  type BackgroundId,
} from "@/data/backgrounds";
import {
  TRANSITIONS,
  type TransitionMode,
} from "@/lib/transitions";

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
  transition: TransitionMode;
  background: BackgroundId;
  ambient: AmbientId;
  ambientVolume: number;
  autoplayNextSurah: boolean;
  onTransitionChange: (mode: TransitionMode) => void;
  onBackgroundChange: (id: BackgroundId) => void;
  onAmbientChange: (id: AmbientId) => void;
  onAmbientVolumeChange: (vol: number) => void;
  onAutoplayNextSurahChange: (next: boolean) => void;
}

const ANIM_MS = 280;

export function SettingsPanel({
  open,
  onClose,
  transition,
  background,
  ambient,
  ambientVolume,
  autoplayNextSurah,
  onTransitionChange,
  onBackgroundChange,
  onAmbientChange,
  onAmbientVolumeChange,
  onAutoplayNextSurahChange,
}: SettingsPanelProps) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const panelWidth = Math.min(440, width);

  // Keep the modal mounted while the close animation runs.
  const [mounted, setMounted] = useState(open);
  const slide = useRef(new Animated.Value(panelWidth)).current;
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (open) {
      setMounted(true);
      Animated.parallel([
        Animated.timing(slide, {
          toValue: 0,
          duration: ANIM_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(fade, {
          toValue: 1,
          duration: ANIM_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    } else if (mounted) {
      Animated.parallel([
        Animated.timing(slide, {
          toValue: panelWidth,
          duration: ANIM_MS,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(fade, {
          toValue: 0,
          duration: ANIM_MS,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [open, panelWidth, slide, fade, mounted]);

  const topInset = Platform.OS === "web" ? Math.max(insets.top, 24) : insets.top;
  const bottomInset =
    Platform.OS === "web" ? Math.max(insets.bottom, 24) : insets.bottom;

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={StyleSheet.absoluteFill}>
        {/* Backdrop */}
        <Animated.View
          style={[StyleSheet.absoluteFill, { opacity: fade }]}
          pointerEvents={open ? "auto" : "none"}
        >
          <Pressable
            style={[StyleSheet.absoluteFill, styles.backdrop]}
            onPress={onClose}
            accessibilityLabel="Close settings"
          />
        </Animated.View>

        {/* Slide-in panel */}
        <Animated.View
          style={[
            styles.panel,
            { width: panelWidth, transform: [{ translateX: slide }] },
          ]}
          accessibilityViewIsModal
          accessibilityLabel="Settings"
        >
          <View style={[styles.header, { paddingTop: topInset + 14 }]}>
            <Text style={styles.headerTitle}>Settings</Text>
            <TouchableOpacity
              onPress={onClose}
              accessibilityLabel="Close settings"
              hitSlop={12}
              style={styles.closeBtn}
              activeOpacity={0.7}
            >
              <Feather name="x" size={22} color="#a3a3a3" />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.body}
            contentContainerStyle={{
              paddingBottom: bottomInset + 32,
              paddingHorizontal: 20,
              paddingTop: 8,
            }}
            showsVerticalScrollIndicator={false}
          >
            {/* === BACKGROUND === */}
            <SectionHeader title="Background" />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.bgRow}
            >
              {BACKGROUND_OPTIONS.map((bg) => {
                const selected = bg.id === background;
                return (
                  <TouchableOpacity
                    key={bg.id}
                    onPress={() => onBackgroundChange(bg.id)}
                    activeOpacity={0.8}
                    style={styles.bgItem}
                  >
                    <View
                      style={[
                        styles.bgSwatch,
                        selected && styles.bgSwatchSelected,
                      ]}
                    >
                      {bg.source ? (
                        <Image
                          source={bg.source}
                          style={StyleSheet.absoluteFill}
                          contentFit="cover"
                        />
                      ) : (
                        <View
                          style={[
                            StyleSheet.absoluteFill,
                            { backgroundColor: "#000" },
                          ]}
                        >
                          <Feather
                            name="slash"
                            size={20}
                            color="#525252"
                            style={styles.bgNoneIcon}
                          />
                        </View>
                      )}
                      {selected && (
                        <View style={styles.bgCheck}>
                          <Feather name="check" size={14} color="#000" />
                        </View>
                      )}
                    </View>
                    <Text
                      style={[
                        styles.bgLabel,
                        selected && styles.bgLabelSelected,
                      ]}
                    >
                      {bg.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* === AMBIENT SOUND === */}
            <SectionHeader title="Ambient sound" style={{ marginTop: 28 }} />
            <View style={styles.group}>
              {AMBIENT_OPTIONS.map((opt, i) => {
                const selected = opt.id === ambient;
                const isLast = i === AMBIENT_OPTIONS.length - 1;
                return (
                  <TouchableOpacity
                    key={opt.id}
                    onPress={() => onAmbientChange(opt.id)}
                    activeOpacity={0.6}
                    style={[
                      styles.row,
                      !isLast && styles.rowDivider,
                    ]}
                  >
                    <View style={styles.rowIcon}>
                      <Feather
                        name={opt.feather as any}
                        size={18}
                        color={selected ? "#f5f5f5" : "#737373"}
                      />
                    </View>
                    <Text
                      style={[
                        styles.rowLabel,
                        selected && styles.rowLabelSelected,
                      ]}
                    >
                      {opt.label}
                    </Text>
                    <View style={styles.rowAccessory}>
                      {selected && (
                        <Feather name="check" size={18} color="#e8c078" />
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Volume — only when an ambient is selected */}
            {ambient !== "off" && (
              <View style={styles.volumeWrap}>
                <View style={styles.volumeHeader}>
                  <Feather name="volume-1" size={14} color="#737373" />
                  <Text style={styles.volumeLabel}>Volume</Text>
                </View>
                <View style={styles.volumeRow}>
                  {[0.25, 0.5, 0.75, 1].map((v) => {
                    const active = ambientVolume >= v - 0.001;
                    return (
                      <TouchableOpacity
                        key={v}
                        onPress={() => onAmbientVolumeChange(v)}
                        activeOpacity={0.7}
                        style={styles.volumeBarTouch}
                      >
                        <View
                          style={[
                            styles.volumeBar,
                            { height: 12 + v * 28 },
                            active && styles.volumeBarActive,
                          ]}
                        />
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {/* === PLAYBACK === */}
            <SectionHeader title="Playback" style={{ marginTop: 28 }} />
            <View style={styles.group}>
              <View style={[styles.row, { paddingVertical: 12 }]}>
                <View style={styles.rowIcon}>
                  <Feather
                    name="skip-forward"
                    size={18}
                    color={autoplayNextSurah ? "#f5f5f5" : "#737373"}
                  />
                </View>
                <View style={styles.rowTextWrap}>
                  <Text
                    style={[
                      styles.rowLabel,
                      autoplayNextSurah && styles.rowLabelSelected,
                    ]}
                  >
                    Auto-play next surah
                  </Text>
                  <Text style={styles.rowSubLabel}>
                    Continue from ayah 1 of the next surah when this one ends.
                  </Text>
                </View>
                <View style={styles.rowAccessory}>
                  <ToggleSwitch
                    value={autoplayNextSurah}
                    onValueChange={onAutoplayNextSurahChange}
                    accessibilityLabel="Auto-play next surah"
                  />
                </View>
              </View>
            </View>

            {/* === VERSE TRANSITION === */}
            <SectionHeader title="Verse transition" style={{ marginTop: 28 }} />
            <View style={styles.group}>
              {TRANSITIONS.map((t, i) => {
                const selected = t.id === transition;
                const isLast = i === TRANSITIONS.length - 1;
                return (
                  <TouchableOpacity
                    key={t.id}
                    onPress={() => onTransitionChange(t.id)}
                    activeOpacity={0.6}
                    style={[
                      styles.row,
                      !isLast && styles.rowDivider,
                      { alignItems: "flex-start", paddingVertical: 14 },
                    ]}
                  >
                    <View style={styles.rowTextWrap}>
                      <Text
                        style={[
                          styles.rowLabel,
                          selected && styles.rowLabelSelected,
                        ]}
                      >
                        {t.label}
                      </Text>
                      <Text style={styles.rowSubLabel}>{t.description}</Text>
                    </View>
                    <View style={[styles.rowAccessory, { paddingTop: 2 }]}>
                      {selected && (
                        <Feather name="check" size={18} color="#e8c078" />
                      )}
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

function SectionHeader({
  title,
  style,
}: {
  title: string;
  style?: object;
}) {
  return <Text style={[styles.sectionHeader, style]}>{title}</Text>;
}

/**
 * Minimal iOS-style toggle. Animated knob slides between off (left,
 * neutral track) and on (right, gold track). Pure RN — no native
 * dependency — so it renders identically on web preview and native.
 */
function ToggleSwitch({
  value,
  onValueChange,
  accessibilityLabel,
}: {
  value: boolean;
  onValueChange: (next: boolean) => void;
  accessibilityLabel?: string;
}) {
  const TRACK_W = 46;
  const TRACK_H = 28;
  const KNOB = 24;
  const PAD = 2;
  const offX = PAD;
  const onX = TRACK_W - KNOB - PAD;
  const knobX = useRef(new Animated.Value(value ? onX : offX)).current;

  useEffect(() => {
    Animated.timing(knobX, {
      toValue: value ? onX : offX,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [value, knobX, onX, offX]);

  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
      style={[
        styles.toggleTrack,
        {
          width: TRACK_W,
          height: TRACK_H,
          borderRadius: TRACK_H / 2,
          backgroundColor: value ? "#e8c078" : "rgba(255,255,255,0.14)",
        },
      ]}
    >
      <Animated.View
        style={[
          styles.toggleKnob,
          {
            width: KNOB,
            height: KNOB,
            borderRadius: KNOB / 2,
            top: PAD,
            transform: [{ translateX: knobX }],
          },
        ]}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: "rgba(0,0,0,0.55)",
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
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 22,
    color: "#f5f5f5",
    fontWeight: "600",
    letterSpacing: -0.4,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  body: {
    flex: 1,
  },

  // Section header (HIG-like grouped list title)
  sectionHeader: {
    fontSize: 12,
    color: "#737373",
    fontWeight: "500",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: 10,
    marginLeft: 4,
  },

  // Grouped list (rounded card with hairline dividers)
  group: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 14,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 50,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.07)",
  },
  rowIcon: {
    width: 30,
    alignItems: "center",
    marginRight: 8,
  },
  rowLabel: {
    flex: 1,
    fontSize: 16,
    color: "#d4d4d4",
    fontWeight: "400",
  },
  rowLabelSelected: {
    color: "#f5f5f5",
    fontWeight: "500",
  },
  rowSubLabel: {
    marginTop: 2,
    fontSize: 13,
    color: "#737373",
    lineHeight: 18,
  },
  rowTextWrap: {
    flex: 1,
    paddingRight: 12,
  },
  rowAccessory: {
    minWidth: 22,
    alignItems: "flex-end",
  },

  // Background swatches
  bgRow: {
    paddingVertical: 4,
    paddingRight: 4,
    gap: 12,
  },
  bgItem: {
    alignItems: "center",
    width: 64,
  },
  bgSwatch: {
    width: 64,
    height: 88,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "transparent",
    backgroundColor: "#000",
    position: "relative",
  },
  bgSwatchSelected: {
    borderColor: "#e8c078",
  },
  bgNoneIcon: {
    position: "absolute",
    top: "50%",
    left: "50%",
    marginLeft: -10,
    marginTop: -10,
  },
  bgCheck: {
    position: "absolute",
    bottom: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#e8c078",
    alignItems: "center",
    justifyContent: "center",
  },
  bgLabel: {
    marginTop: 8,
    fontSize: 11,
    color: "#737373",
    fontWeight: "500",
  },
  bgLabelSelected: {
    color: "#f5f5f5",
  },

  // Volume control
  volumeWrap: {
    marginTop: 14,
    paddingHorizontal: 4,
  },
  volumeHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  volumeLabel: {
    fontSize: 12,
    color: "#737373",
    fontWeight: "500",
  },
  volumeRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    height: 48,
  },
  volumeBarTouch: {
    flex: 1,
    height: 48,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  volumeBarActive: {
    backgroundColor: "#e8c078",
  },
  volumeBar: {
    width: "100%",
    backgroundColor: "rgba(255,255,255,0.10)",
    borderRadius: 6,
  },

  // Toggle switch
  toggleTrack: {
    position: "relative",
    justifyContent: "center",
  },
  toggleKnob: {
    position: "absolute",
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
});
