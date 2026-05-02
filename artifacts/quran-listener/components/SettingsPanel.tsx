import { SymbolIcon } from "@/components/SymbolIcon";
import { VideoSwatch } from "@/components/VideoBackground";
import { Image } from "expo-image";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Modal,
  PanResponder,
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

import { Ionicons } from "@expo/vector-icons";
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

const AMBIENT_IONICONS: Record<AmbientId, keyof typeof Ionicons.glyphMap> = {
  off: "ban",
  rain: "rainy",
  ocean: "water",
  forest: "leaf",
  night: "moon",
  wind: "cloudy",
};

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
  transition: TransitionMode;
  background: BackgroundId;
  ambient: AmbientId;
  ambientVolume: number;
  autoplayNextSurah: boolean;
  backgroundDim: boolean;
  sleepTimerMinutes: number | null;
  onTransitionChange: (mode: TransitionMode) => void;
  onBackgroundChange: (id: BackgroundId) => void;
  onAmbientChange: (id: AmbientId) => void;
  onAmbientVolumeChange: (vol: number) => void;
  onAutoplayNextSurahChange: (next: boolean) => void;
  onBackgroundDimChange: (next: boolean) => void;
  onSleepTimerChange: (minutes: number | null) => void;
}

const SLEEP_OPTIONS: { label: string; shortLabel: string; minutes: number | null }[] = [
  { label: "Off", shortLabel: "Off", minutes: null },
  { label: "10 min", shortLabel: "10m", minutes: 10 },
  { label: "20 min", shortLabel: "20m", minutes: 20 },
  { label: "30 min", shortLabel: "30m", minutes: 30 },
  { label: "1 hour", shortLabel: "1h", minutes: 60 },
];

const ANIM_MS = 320;
const SHEET_MAX_HEIGHT_FRACTION = 0.92;
const SWIPE_CLOSE_THRESHOLD = 90;

export function SettingsPanel({
  open,
  onClose,
  transition,
  background,
  ambient,
  ambientVolume,
  autoplayNextSurah,
  backgroundDim,
  sleepTimerMinutes,
  onTransitionChange,
  onBackgroundChange,
  onAmbientChange,
  onAmbientVolumeChange,
  onAutoplayNextSurahChange,
  onBackgroundDimChange,
  onSleepTimerChange,
}: SettingsPanelProps) {
  const { height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const sheetHeight = screenHeight * SHEET_MAX_HEIGHT_FRACTION;

  // Keep the modal mounted while the close animation runs.
  const [mounted, setMounted] = useState(open);
  const slide = useRef(new Animated.Value(sheetHeight)).current;
  const dragY = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(0)).current;

  // Keep onClose stable for the PanResponder closure
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const swipePan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) dragY.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > SWIPE_CLOSE_THRESHOLD || g.vy > 0.8) {
          dragY.setValue(0);
          onCloseRef.current();
        } else {
          Animated.spring(dragY, {
            toValue: 0,
            useNativeDriver: true,
            tension: 180,
            friction: 18,
          }).start();
        }
      },
    }),
  ).current;

  useEffect(() => {
    if (open) {
      dragY.setValue(0);
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
          toValue: sheetHeight,
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
  }, [open, sheetHeight, slide, dragY, fade, mounted]);

  const bottomInset =
    Platform.OS === "web" ? Math.max(insets.bottom, 20) : insets.bottom;

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

        {/* Bottom sheet panel */}
        <Animated.View
          style={[
            styles.panel,
            {
              height: sheetHeight,
              transform: [{ translateY: Animated.add(slide, dragY) }],
            },
          ]}
          accessibilityViewIsModal
          accessibilityLabel="Settings"
        >
          {/* Handle grip — swipe down to dismiss */}
          <View style={styles.handleWrap} {...swipePan.panHandlers}>
            <View style={styles.handle} />
          </View>

          <View style={styles.header}>
            <Text style={styles.headerTitle}>Settings</Text>
            <TouchableOpacity
              onPress={onClose}
              accessibilityLabel="Close settings"
              hitSlop={12}
              style={styles.closeBtn}
              activeOpacity={0.7}
            >
              <SymbolIcon name="xmark" fallbackIonicon="close" size={18} color="#a3a3a3" weight="semibold" />
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
                    <View style={styles.bgSwatch}>
                      {bg.videoUrl ? (
                        // Live video swatch — plays a tiny looping preview
                        <VideoSwatch url={bg.videoUrl} />
                      ) : bg.source ? (
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
                          <SymbolIcon
                            name="xmark"
                            fallbackIonicon="close"
                            size={20}
                            color="#525252"
                            style={styles.bgNoneIcon}
                          />
                        </View>
                      )}
                      {/* "Live" badge on video backgrounds */}
                      {bg.videoUrl && !selected && (
                        <View style={styles.bgLiveBadge} pointerEvents="none">
                          <Text style={styles.bgLiveBadgeText}>LIVE</Text>
                        </View>
                      )}
                      {selected && (
                        <View style={styles.bgSelectedRing} pointerEvents="none" />
                      )}
                      {selected && (
                        <View style={styles.bgCheck}>
                          <SymbolIcon name="checkmark" fallbackIonicon="checkmark" size={13} color="#000" weight="semibold" />
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

            <View style={[styles.group, { marginTop: 14 }]}>
              <View style={[styles.row, { paddingVertical: 12 }]}>
                <View style={styles.rowIcon}>
                  <SymbolIcon
                    name="sun.max.fill"
                    fallbackIonicon="sunny"
                    size={18}
                    color={backgroundDim ? "#737373" : "#f5f5f5"}
                  />
                </View>
                <View style={styles.rowTextWrap}>
                  <Text
                    style={[
                      styles.rowLabel,
                      !backgroundDim && styles.rowLabelSelected,
                    ]}
                  >
                    Dim background
                  </Text>
                  <Text style={styles.rowSubLabel}>
                    Adds a dark overlay so the verse stays readable. Turn off
                    to see the image at full brightness.
                  </Text>
                </View>
                <View style={styles.rowAccessory}>
                  <ToggleSwitch
                    value={backgroundDim}
                    onValueChange={onBackgroundDimChange}
                    accessibilityLabel="Dim background"
                  />
                </View>
              </View>
            </View>

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
                      <SymbolIcon
                        name={opt.sfSymbol as any}
                        fallbackIonicon={AMBIENT_IONICONS[opt.id]}
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
                        <SymbolIcon name="checkmark" fallbackIonicon="checkmark" size={17} color="#e8c078" weight="semibold" />
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Volume slider — only when an ambient is selected */}
            {ambient !== "off" && (
              <View style={styles.volumeWrap}>
                <View style={styles.volumeHeader}>
                  <SymbolIcon
                    name="speaker.wave.1.fill"
                    fallbackIonicon="volume-low"
                    size={14}
                    color="#8e8e93"
                  />
                  <Text style={styles.volumeLabel}>Ambient volume</Text>
                  <SymbolIcon
                    name="speaker.wave.3.fill"
                    fallbackIonicon="volume-high"
                    size={14}
                    color="#8e8e93"
                    style={{ marginLeft: "auto" } as any}
                  />
                </View>
                <View style={styles.volumeRow}>
                  {([0.25, 0.5, 0.75, 1] as const).map((v) => (
                    <TouchableOpacity
                      key={v}
                      onPress={() => onAmbientVolumeChange(v)}
                      hitSlop={8}
                      style={styles.volumeBarTouch}
                      accessibilityLabel={`Volume ${Math.round(v * 100)}%`}
                      activeOpacity={0.7}
                    >
                      <View
                        style={[
                          styles.volumeBar,
                          { height: 12 + v * 28 },
                          ambientVolume >= v && styles.volumeBarActive,
                        ]}
                      />
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* === PLAYBACK === */}
            <SectionHeader title="Playback" style={{ marginTop: 28 }} />
            <View style={styles.group}>
              <View style={[styles.row, { paddingVertical: 12 }]}>
                <View style={styles.rowIcon}>
                  <SymbolIcon
                    name="forward.end.fill"
                    fallbackIonicon="play-skip-forward"
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

            {/* === SLEEP TIMER === */}
            <SectionHeader title="Sleep timer" style={{ marginTop: 28 }} />
            <View style={styles.sleepPillContainer}>
              {SLEEP_OPTIONS.map((opt) => {
                const selected = opt.minutes === sleepTimerMinutes;
                return (
                  <TouchableOpacity
                    key={opt.label}
                    onPress={() => onSleepTimerChange(opt.minutes)}
                    activeOpacity={0.7}
                    style={[
                      styles.sleepPill,
                      selected && styles.sleepPillSelected,
                    ]}
                    accessibilityLabel={opt.label}
                    accessibilityState={{ selected }}
                  >
                    <Text
                      style={[
                        styles.sleepPillText,
                        selected && styles.sleepPillTextSelected,
                      ]}
                    >
                      {opt.shortLabel}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={styles.sleepHint}>
              Audio fades out and pauses when the timer ends.
            </Text>

            {/* === VERSE TRANSITION === */}
            <SectionHeader title="Verse transition" style={{ marginTop: 28 }} />
            <View style={styles.group}>
              <View style={[styles.row, { paddingVertical: 12 }]}>
                <View style={styles.rowIcon}>
                  <SymbolIcon
                    name="sparkles"
                    fallbackIonicon="sparkles"
                    size={18}
                    color={transition === "crossfade" ? "#f5f5f5" : "#737373"}
                  />
                </View>
                <View style={styles.rowTextWrap}>
                  <Text
                    style={[
                      styles.rowLabel,
                      transition === "crossfade" && styles.rowLabelSelected,
                    ]}
                  >
                    Crossfade
                  </Text>
                  <Text style={styles.rowSubLabel}>
                    Verse fades out completely, then the next fades in. Off for instant snapping.
                  </Text>
                </View>
                <View style={styles.rowAccessory}>
                  <ToggleSwitch
                    value={transition === "crossfade"}
                    onValueChange={(next) =>
                      onTransitionChange(next ? "crossfade" : "instant")
                    }
                    accessibilityLabel="Crossfade verse transition"
                  />
                </View>
              </View>
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
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#1c1c1e",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: -8 },
    elevation: 32,
    overflow: "hidden",
  },
  handleWrap: {
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 6,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  headerTitle: {
    fontSize: 17,
    color: "#f5f5f5",
    fontWeight: "600",
    letterSpacing: -0.2,
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
    fontSize: 13,
    color: "#8e8e93",
    fontWeight: "400",
    letterSpacing: 0,
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
    fontSize: 17,
    color: "#d4d4d4",
    fontWeight: "400",
  },
  rowLabelSelected: {
    color: "#f5f5f5",
    fontWeight: "500",
  },
  rowSubLabel: {
    marginTop: 3,
    fontSize: 13,
    color: "#8e8e93",
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
    backgroundColor: "#000",
    position: "relative",
  },
  bgSelectedRing: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 2,
    borderColor: "#e8c078",
    borderRadius: 12,
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
  bgLiveBadge: {
    position: "absolute",
    top: 6,
    left: 6,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  bgLiveBadgeText: {
    fontSize: 8,
    fontWeight: "700",
    color: "#e8c078",
    letterSpacing: 0.5,
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
    gap: 8,
    marginBottom: 12,
  },
  volumeLabel: {
    fontSize: 13,
    color: "#8e8e93",
    fontWeight: "400",
    flex: 1,
  },
  volumeRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 5,
  },
  volumeBarTouch: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingVertical: 4,
  },
  volumeBar: {
    width: "100%",
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  volumeBarActive: {
    backgroundColor: "#e8c078",
  },

  sleepPillContainer: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 14,
    padding: 5,
    gap: 4,
  },
  sleepPill: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  sleepPillSelected: {
    backgroundColor: "rgba(232,192,120,0.18)",
  },
  sleepPillText: {
    fontSize: 15,
    color: "#737373",
    fontWeight: "400",
    letterSpacing: 0,
  },
  sleepPillTextSelected: {
    color: "#e8c078",
    fontWeight: "600",
  },
  sleepHint: {
    marginTop: 10,
    marginLeft: 4,
    fontSize: 12,
    color: "#737373",
    lineHeight: 18,
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
