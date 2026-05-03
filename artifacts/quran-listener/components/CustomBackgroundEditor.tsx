/**
 * CustomBackgroundEditor
 *
 * Full-screen modal that lets the user pick a photo or video from their
 * device library and position it behind the Quran verse text.
 *
 * Layout:
 *   [Cancel]   Adjust Background   [Set]
 *
 *          ┌─────────────────┐
 *          │ ●●●         9:41│  ← status bar
 *          │   ⬛⬛⬛⬛⬛   │  ← dynamic island
 *          │                 │
 *          │  <Arabic text>  │  ← sample verse overlay
 *          │  <translation>  │
 *          │                 │
 *          │    ── ▶ ──      │  ← mini controls
 *          └─────────────────┘
 *   Drag to reposition · Pinch or scroll to zoom
 *
 *   ┌──────────────────────────────────┐
 *   │  📷  Choose Photo        ›       │
 *   ├──────────────────────────────────┤
 *   │  🎬  Choose Video        ›       │
 *   └──────────────────────────────────┘
 *
 * Gesture handling:
 *   • Single-touch drag  → pan the background inside the mockup
 *   • Two-touch pinch    → zoom (scale ≥ 1; image always fills frame)
 *   • Mouse wheel (web)  → zoom
 *   • Spring snap-back   → if scale < 1 or image would expose empty space
 *
 * Transform persistence:
 *   Offsets are stored as fractions of the screen so the composition
 *   looks identical at any screen size (see CustomBg in useSettings.ts).
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Modal,
  PanResponder,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SymbolIcon } from "@/components/SymbolIcon";
import type { CustomBg } from "@/lib/useSettings";

const PHONE_RADIUS = 44;
const SCREEN_RADIUS = 40;
const PHONE_PADDING = 4;
const HOME_BAR_AREA = 30;

const SAMPLE_ARABIC = "بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ";
const SAMPLE_TRANSLATION =
  "In the name of Allah, the Entirely Merciful, the Especially Merciful.";

interface Props {
  open: boolean;
  onClose: () => void;
  current: CustomBg | null;
  onApply: (bg: CustomBg) => void;
}

export function CustomBackgroundEditor({
  open,
  onClose,
  current,
  onApply,
}: Props) {
  const { width: sw, height: sh } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  // ── State ─────────────────────────────────────────────────────────────────
  const [draftUri, setDraftUri] = useState<string | null>(null);
  const [draftMediaType, setDraftMediaType] = useState<"image" | "video">(
    "image",
  );
  const [picking, setPicking] = useState(false);

  // ── ALL refs declared before any effect (React Compiler requirement) ──────
  const draftUriRef = useRef<string | null>(null);
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const translateXAnim = useRef(new Animated.Value(0)).current;
  const translateYAnim = useRef(new Animated.Value(0)).current;
  const currentScaleRef = useRef(1);
  const currentTxRef = useRef(0);
  const currentTyRef = useRef(0);
  const gestureRef = useRef({
    startScale: 1,
    startTx: 0,
    startTy: 0,
    startDist: 1,
    lastScale: 1,
    lastTx: 0,
    lastTy: 0,
  });
  // Updated unconditionally each render so PanResponder closures always
  // read the latest values — same pattern used by SettingsPanel / SurahPicker.
  const clampRef = useRef<
    (
      s: number,
      x: number,
      y: number,
    ) => { scale: number; tx: number; ty: number }
  >((s, x, y) => ({ scale: s, tx: x, ty: y }));
  const mockupDimsRef = useRef({ w: 0, h: 0 });

  // ── Mockup dimensions (computed from available space) ─────────────────────
  const NAV_H = 56;
  const BOTTOM_H = 168 + insets.bottom; // instruction + picker card
  const availH =
    sh - insets.top - NAV_H - BOTTOM_H - 16;
  const availW = sw - 40;
  const ASPECT = 19.5 / 9;
  let mH = Math.min(Math.max(availH, 280), 540);
  let mW = mH / ASPECT;
  if (mW > availW) {
    mW = availW;
    mH = mW * ASPECT;
  }

  // ── Sync live refs each render ────────────────────────────────────────────
  draftUriRef.current = draftUri;
  mockupDimsRef.current = { w: mW, h: mH };
  clampRef.current = (scale, tx, ty) => {
    const cs = Math.max(1.0, scale);
    const maxTx = ((cs - 1) / 2) * mockupDimsRef.current.w;
    const maxTy = ((cs - 1) / 2) * mockupDimsRef.current.h;
    return {
      scale: cs,
      tx: Math.max(-maxTx, Math.min(maxTx, tx)),
      ty: Math.max(-maxTy, Math.min(maxTy, ty)),
    };
  };

  // ── PanResponder (created once; reads live refs) ──────────────────────────
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => draftUriRef.current !== null,
      onMoveShouldSetPanResponder: () => draftUriRef.current !== null,
      onPanResponderGrant: (evt) => {
        const g = gestureRef.current;
        g.startScale = currentScaleRef.current;
        g.startTx = currentTxRef.current;
        g.startTy = currentTyRef.current;
        g.lastScale = currentScaleRef.current;
        g.lastTx = currentTxRef.current;
        g.lastTy = currentTyRef.current;
        const t = evt.nativeEvent.touches;
        if (t && t.length >= 2) {
          const dx = t[1].pageX - t[0].pageX;
          const dy = t[1].pageY - t[0].pageY;
          g.startDist = Math.sqrt(dx * dx + dy * dy) || 1;
        }
      },
      onPanResponderMove: (evt, s) => {
        const g = gestureRef.current;
        const t = evt.nativeEvent.touches;
        if (t && t.length >= 2) {
          const dx = t[1].pageX - t[0].pageX;
          const dy = t[1].pageY - t[0].pageY;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const newScale = Math.max(0.3, g.startScale * (dist / g.startDist));
          scaleAnim.setValue(newScale);
          g.lastScale = newScale;
        } else {
          const newTx = g.startTx + s.dx;
          const newTy = g.startTy + s.dy;
          translateXAnim.setValue(newTx);
          translateYAnim.setValue(newTy);
          g.lastTx = newTx;
          g.lastTy = newTy;
        }
      },
      onPanResponderRelease: () => {
        const g = gestureRef.current;
        const clamped = clampRef.current(g.lastScale, g.lastTx, g.lastTy);
        const needsSpring =
          clamped.scale !== g.lastScale ||
          clamped.tx !== g.lastTx ||
          clamped.ty !== g.lastTy;
        if (needsSpring) {
          Animated.parallel([
            Animated.spring(scaleAnim, {
              toValue: clamped.scale,
              useNativeDriver: true,
              tension: 200,
              friction: 22,
            }),
            Animated.spring(translateXAnim, {
              toValue: clamped.tx,
              useNativeDriver: true,
              tension: 200,
              friction: 22,
            }),
            Animated.spring(translateYAnim, {
              toValue: clamped.ty,
              useNativeDriver: true,
              tension: 200,
              friction: 22,
            }),
          ]).start();
        }
        currentScaleRef.current = clamped.scale;
        currentTxRef.current = clamped.tx;
        currentTyRef.current = clamped.ty;
        g.lastScale = clamped.scale;
        g.lastTx = clamped.tx;
        g.lastTy = clamped.ty;
      },
      onPanResponderTerminate: () => {
        const g = gestureRef.current;
        currentScaleRef.current = g.lastScale;
        currentTxRef.current = g.lastTx;
        currentTyRef.current = g.lastTy;
      },
    }),
  ).current;

  // ── Effect: load / reset transform when editor opens ─────────────────────
  useEffect(() => {
    if (!open) return;
    if (current) {
      const pixelTx = current.normalizedTx * mockupDimsRef.current.w;
      const pixelTy = current.normalizedTy * mockupDimsRef.current.h;
      setDraftUri(current.uri);
      setDraftMediaType(current.mediaType);
      scaleAnim.setValue(current.scale);
      translateXAnim.setValue(pixelTx);
      translateYAnim.setValue(pixelTy);
      currentScaleRef.current = current.scale;
      currentTxRef.current = pixelTx;
      currentTyRef.current = pixelTy;
      gestureRef.current.lastScale = current.scale;
      gestureRef.current.lastTx = pixelTx;
      gestureRef.current.lastTy = pixelTy;
    } else {
      setDraftUri(null);
      scaleAnim.setValue(1);
      translateXAnim.setValue(0);
      translateYAnim.setValue(0);
      currentScaleRef.current = 1;
      currentTxRef.current = 0;
      currentTyRef.current = 0;
      const g = gestureRef.current;
      g.lastScale = 1;
      g.lastTx = 0;
      g.lastTy = 0;
    }
  }, [open, current, scaleAnim, translateXAnim, translateYAnim]);

  // ── Effect: mouse wheel zoom (web only) ───────────────────────────────────
  useEffect(() => {
    if (Platform.OS !== "web" || !open) return;
    const handleWheel = (e: Event) => {
      const we = e as WheelEvent;
      we.preventDefault();
      const delta = we.deltaY < 0 ? 0.09 : -0.09;
      const newRaw = currentScaleRef.current + delta;
      const newScale = Math.max(0.3, newRaw);
      scaleAnim.setValue(newScale);
      gestureRef.current.lastScale = newScale;
      currentScaleRef.current = newScale;
    };
    const el = document.getElementById("cbg-mockup-screen");
    if (el) {
      el.addEventListener("wheel", handleWheel, { passive: false });
      return () => el.removeEventListener("wheel", handleWheel);
    }
  }, [open, scaleAnim]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const resetTransform = useCallback(() => {
    scaleAnim.setValue(1);
    translateXAnim.setValue(0);
    translateYAnim.setValue(0);
    currentScaleRef.current = 1;
    currentTxRef.current = 0;
    currentTyRef.current = 0;
    const g = gestureRef.current;
    g.lastScale = 1;
    g.lastTx = 0;
    g.lastTy = 0;
  }, [scaleAnim, translateXAnim, translateYAnim]);

  const pickImage = useCallback(async () => {
    setPicking(true);
    try {
      if (Platform.OS !== "web") {
        const { status } =
          await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== "granted") {
          setPicking(false);
          return;
        }
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"] as unknown as ImagePicker.MediaTypeOptions,
        allowsEditing: false,
        quality: 0.92,
      });
      if (!result.canceled && result.assets[0]) {
        let uri = result.assets[0].uri;
        // On web, expo-image-picker returns a blob: URL which does not survive
        // a page reload. Convert to a base64 data URL for persistence (capped
        // at 4 MB to avoid saturating AsyncStorage).
        if (Platform.OS === "web" && uri.startsWith("blob:")) {
          try {
            const resp = await fetch(uri);
            const blob = await resp.blob();
            if (blob.size < 4_000_000) {
              uri = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
              });
            }
            // If > 4 MB keep the blob URL (session-only, acceptable trade-off)
          } catch {
            // keep original blob URL
          }
        }
        setDraftUri(uri);
        setDraftMediaType("image");
        resetTransform();
      }
    } finally {
      setPicking(false);
    }
  }, [resetTransform]);

  const pickVideo = useCallback(async () => {
    setPicking(true);
    try {
      if (Platform.OS !== "web") {
        const { status } =
          await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== "granted") {
          setPicking(false);
          return;
        }
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["videos"] as unknown as ImagePicker.MediaTypeOptions,
        allowsEditing: false,
        quality: 1,
        videoMaxDuration: 120,
      });
      if (!result.canceled && result.assets[0]) {
        setDraftUri(result.assets[0].uri);
        setDraftMediaType("video");
        resetTransform();
      }
    } finally {
      setPicking(false);
    }
  }, [resetTransform]);

  const handleApply = useCallback(() => {
    if (!draftUri) return;
    const clamped = clampRef.current(
      currentScaleRef.current,
      currentTxRef.current,
      currentTyRef.current,
    );
    const { w, h } = mockupDimsRef.current;
    onApply({
      uri: draftUri,
      mediaType: draftMediaType,
      scale: clamped.scale,
      normalizedTx: w > 0 ? clamped.tx / w : 0,
      normalizedTy: h > 0 ? clamped.ty / h : 0,
    });
  }, [draftUri, draftMediaType, onApply]);

  const hasMedia = draftUri !== null;

  // Font sizes that scale with mockup width
  const arabicFs = Math.max(16, mW * 0.13);
  const translationFs = Math.max(8, mW * 0.052);
  const eyebrowFs = Math.max(7, mW * 0.046);
  const playBtnSize = Math.max(18, mW * 0.14);

  return (
    <Modal
      visible={open}
      animationType="slide"
      presentationStyle={Platform.OS === "ios" ? "pageSheet" : "fullScreen"}
      onRequestClose={onClose}
      statusBarTranslucent={Platform.OS === "android"}
    >
      <View
        style={[
          styles.container,
          { paddingTop: Platform.OS === "ios" ? 0 : insets.top },
        ]}
      >
        {/* ── Navigation bar ─────────────────────────────────────────── */}
        <View style={styles.navBar}>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={12}
            style={styles.navSideBtn}
            activeOpacity={0.6}
          >
            <Text style={styles.navCancel}>Cancel</Text>
          </TouchableOpacity>

          <Text style={styles.navTitle} numberOfLines={1}>
            {hasMedia ? "Adjust Background" : "Custom Background"}
          </Text>

          <TouchableOpacity
            onPress={handleApply}
            hitSlop={12}
            style={[styles.navSideBtn, styles.navSideBtnRight]}
            activeOpacity={hasMedia ? 0.6 : 1}
            disabled={!hasMedia}
          >
            <Text style={[styles.navSet, !hasMedia && styles.navSetDisabled]}>
              Set
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── Mockup area ───────────────────────────────────────────── */}
        <View style={styles.mockupArea}>
          {/* Phone body */}
          <View
            style={[
              styles.phoneBody,
              {
                width: mW + PHONE_PADDING * 2,
                height: mH + PHONE_PADDING + HOME_BAR_AREA,
                borderRadius: PHONE_RADIUS,
              },
              Platform.OS === "web"
                ? ({ boxShadow: "0 28px 80px rgba(0,0,0,0.9)" } as object)
                : {
                    shadowColor: "#000",
                    shadowOpacity: 0.9,
                    shadowRadius: 40,
                    shadowOffset: { width: 0, height: 20 },
                    elevation: 40,
                  },
            ]}
          >
            {/* Screen */}
            <View
              nativeID="cbg-mockup-screen"
              style={[
                styles.screen,
                {
                  width: mW,
                  height: mH,
                  borderRadius: SCREEN_RADIUS,
                  marginTop: PHONE_PADDING,
                  marginHorizontal: PHONE_PADDING,
                },
              ]}
              {...panResponder.panHandlers}
            >
              {/* Dynamic island */}
              <View style={styles.dynamicIsland} pointerEvents="none" />

              {/* ── Background media with transform ───────────────── */}
              {hasMedia && (
                <Animated.View
                  style={[
                    StyleSheet.absoluteFill,
                    {
                      transform: [
                        { scale: scaleAnim },
                        { translateX: translateXAnim },
                        { translateY: translateYAnim },
                      ],
                    },
                  ]}
                  pointerEvents="none"
                >
                  {draftMediaType === "image" || Platform.OS !== "web" ? (
                    <Image
                      source={{ uri: draftUri! }}
                      style={StyleSheet.absoluteFill}
                      contentFit="cover"
                    />
                  ) : (
                    // Web video preview
                    <View style={StyleSheet.absoluteFill}>
                      {React.createElement("video", {
                        src: draftUri,
                        autoPlay: true,
                        loop: true,
                        muted: true,
                        playsInline: true,
                        controls: false,
                        style: {
                          position: "absolute" as const,
                          top: 0,
                          left: 0,
                          width: "100%",
                          height: "100%",
                          objectFit: "cover" as const,
                          pointerEvents: "none" as const,
                        },
                      })}
                    </View>
                  )}
                </Animated.View>
              )}

              {/* Placeholder when no media */}
              {!hasMedia && (
                <View style={styles.placeholder} pointerEvents="none">
                  <View style={styles.placeholderGlow}>
                    <SymbolIcon
                      name="photo.on.rectangle"
                      fallbackIonicon="images-outline"
                      size={44}
                      color="#4a4a4e"
                    />
                  </View>
                  <Text style={styles.placeholderText}>
                    Your chosen image or video{"\n"}will appear here
                  </Text>
                  <Text style={styles.placeholderHint}>
                    Tap Choose Photo or Video below
                  </Text>
                </View>
              )}

              {/* Scrim */}
              {hasMedia && (
                <LinearGradient
                  colors={[
                    "rgba(0,0,0,0.42)",
                    "rgba(0,0,0,0.16)",
                    "rgba(0,0,0,0.40)",
                    "rgba(0,0,0,0.72)",
                  ]}
                  locations={[0, 0.35, 0.65, 1]}
                  style={StyleSheet.absoluteFill}
                  pointerEvents="none"
                />
              )}

              {/* Content overlay — Arabic text preview */}
              {hasMedia && (
                <View style={StyleSheet.absoluteFill} pointerEvents="none">
                  {/* Status bar row */}
                  <View style={styles.statusRow}>
                    <Text style={styles.statusTime}>9:41</Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <SymbolIcon name="wifi" fallbackIonicon="wifi" size={8} color="rgba(255,255,255,0.8)" />
                      <SymbolIcon name="battery.100" fallbackIonicon="battery-full" size={9} color="rgba(255,255,255,0.8)" />
                    </View>
                  </View>

                  {/* Surah eyebrow */}
                  <Text
                    style={[styles.previewEyebrow, { fontSize: eyebrowFs }]}
                    numberOfLines={1}
                  >
                    Surah 1 — Al-Fātiḥa
                  </Text>

                  {/* Arabic + translation */}
                  <View style={styles.previewTextWrap}>
                    <Text
                      style={[
                        styles.previewArabic,
                        { fontSize: arabicFs, lineHeight: arabicFs * 1.65 },
                      ]}
                      numberOfLines={3}
                    >
                      {SAMPLE_ARABIC}
                    </Text>
                    <Text
                      style={[
                        styles.previewTranslation,
                        {
                          fontSize: translationFs,
                          lineHeight: translationFs * 1.5,
                        },
                      ]}
                      numberOfLines={3}
                    >
                      {SAMPLE_TRANSLATION}
                    </Text>
                  </View>

                  {/* Mini footer controls */}
                  <View style={styles.previewFooter}>
                    <View style={styles.previewProgressBar}>
                      <View
                        style={[styles.previewProgressFill, { width: "32%" }]}
                      />
                    </View>
                    <View style={styles.previewControlsRow}>
                      <View
                        style={[
                          styles.previewPlayBtn,
                          {
                            width: playBtnSize,
                            height: playBtnSize,
                            borderRadius: playBtnSize / 2,
                          },
                        ]}
                      />
                    </View>
                    <View style={styles.previewHomeBar} />
                  </View>
                </View>
              )}
            </View>

            {/* Home indicator at phone body bottom */}
            <View style={styles.homeBarRow} pointerEvents="none">
              <View style={styles.homeBar} />
            </View>
          </View>
        </View>

        {/* ── Instruction hint ──────────────────────────────────────── */}
        <Text style={[styles.instruction, { opacity: hasMedia ? 1 : 0 }]}>
          Drag to reposition · Pinch or scroll to zoom
        </Text>

        {/* ── Media picker card ─────────────────────────────────────── */}
        <View
          style={[styles.pickerCard, { marginBottom: insets.bottom + 20 }]}
        >
          <TouchableOpacity
            onPress={pickImage}
            activeOpacity={0.65}
            style={[styles.pickerRow, styles.pickerRowBorder]}
            disabled={picking}
          >
            <SymbolIcon
              name="photo"
              fallbackIonicon="image-outline"
              size={19}
              color={picking ? "#3a3a3c" : "#e8c078"}
            />
            <Text
              style={[
                styles.pickerRowLabel,
                picking && styles.pickerRowLabelDim,
              ]}
            >
              Choose Photo
            </Text>
            <SymbolIcon
              name="chevron.right"
              fallbackIonicon="chevron-forward"
              size={14}
              color="#525252"
            />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={pickVideo}
            activeOpacity={0.65}
            style={styles.pickerRow}
            disabled={picking}
          >
            <SymbolIcon
              name="video"
              fallbackIonicon="videocam-outline"
              size={19}
              color={picking ? "#3a3a3c" : "#e8c078"}
            />
            <Text
              style={[
                styles.pickerRowLabel,
                picking && styles.pickerRowLabelDim,
              ]}
            >
              Choose Video
            </Text>
            <SymbolIcon
              name="chevron.right"
              fallbackIonicon="chevron-forward"
              size={14}
              color="#525252"
            />
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a0a",
  },

  // ── Nav bar ────────────────────────────────────────────────────────────────
  navBar: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  navSideBtn: {
    width: 72,
  },
  navSideBtnRight: {
    alignItems: "flex-end",
  },
  navTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 17,
    fontWeight: "600",
    color: "#f5f5f5",
    letterSpacing: -0.2,
  },
  navCancel: {
    fontSize: 17,
    color: "#f5f5f5",
    fontWeight: "400",
  },
  navSet: {
    fontSize: 17,
    color: "#e8c078",
    fontWeight: "600",
  },
  navSetDisabled: {
    opacity: 0,
  },

  // ── Mockup ─────────────────────────────────────────────────────────────────
  mockupArea: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  phoneBody: {
    backgroundColor: "#1a1a1c",
    alignItems: "center",
  },
  screen: {
    overflow: "hidden",
    backgroundColor: "#000",
  },
  dynamicIsland: {
    position: "absolute",
    top: 10,
    alignSelf: "center",
    width: 110,
    height: 32,
    borderRadius: 18,
    backgroundColor: "#000",
    zIndex: 10,
  },

  // Placeholder (no media selected)
  placeholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  placeholderGlow: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(232,192,120,0.04)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  placeholderText: {
    fontSize: 12,
    color: "#4a4a4e",
    textAlign: "center",
    lineHeight: 18,
  },
  placeholderHint: {
    fontSize: 10,
    color: "#2e2e30",
    textAlign: "center",
    marginTop: 2,
  },

  // Status bar inside mockup
  statusRow: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 50,
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 18,
    paddingBottom: 6,
  },
  statusTime: {
    flex: 1,
    fontSize: 10,
    fontWeight: "600",
    color: "#fff",
    letterSpacing: -0.2,
  },
  statusIcons: {
    fontSize: 7,
    color: "rgba(255,255,255,0.55)",
    letterSpacing: 2,
  },

  // Arabic preview
  previewEyebrow: {
    position: "absolute",
    top: 56,
    left: 0,
    right: 0,
    textAlign: "center",
    color: "rgba(255,255,255,0.55)",
    fontWeight: "400",
    letterSpacing: 0.1,
  },
  previewTextWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    top: "30%",
    paddingHorizontal: "6%",
    alignItems: "center",
  },
  previewArabic: {
    color: "#ffffff",
    fontWeight: "400",
    textAlign: "center",
    writingDirection: "rtl",
  },
  previewTranslation: {
    color: "rgba(255,255,255,0.72)",
    textAlign: "center",
    marginTop: 6,
  },

  // Mini footer preview
  previewFooter: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: "5%",
    paddingBottom: 4,
    gap: 6,
  },
  previewProgressBar: {
    height: 2,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: 1,
    overflow: "hidden",
  },
  previewProgressFill: {
    height: 2,
    backgroundColor: "#e8c078",
    borderRadius: 1,
  },
  previewControlsRow: {
    alignItems: "center",
    paddingVertical: 2,
  },
  previewPlayBtn: {
    backgroundColor: "rgba(255,255,255,0.82)",
  },
  previewHomeBar: {
    alignSelf: "center",
    width: 60,
    height: 3,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.3)",
    marginTop: 2,
  },

  // Phone body home bar
  homeBarRow: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  homeBar: {
    width: 100,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.18)",
  },

  // ── Instruction ────────────────────────────────────────────────────────────
  instruction: {
    textAlign: "center",
    fontSize: 13,
    color: "#666",
    paddingVertical: 10,
    letterSpacing: 0.1,
  },

  // ── Picker card ────────────────────────────────────────────────────────────
  pickerCard: {
    marginHorizontal: 20,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 14,
    overflow: "hidden",
  },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 16,
    gap: 14,
  },
  pickerRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.07)",
  },
  pickerRowLabel: {
    flex: 1,
    fontSize: 17,
    color: "#f5f5f5",
    fontWeight: "400",
  },
  pickerRowLabelDim: {
    color: "#3a3a3c",
  },
});
