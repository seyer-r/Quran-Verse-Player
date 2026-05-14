/**
 * CustomBackgroundEditor — Apple-style full-screen wallpaper editor.
 *
 * Gestures use react-native-gesture-handler (Gesture.Simultaneous pinch +
 * pan) + Reanimated shared values so the entire gesture loop runs on the UI
 * thread — identical to how UIPinchGestureRecognizer works on iOS.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SymbolIcon } from "@/components/SymbolIcon";
import type { CustomBg } from "@/lib/useSettings";

interface Props {
  open: boolean;
  onClose: () => void;
  current: CustomBg | null;
  onApply: (bg: CustomBg) => void;
  /** Arabic text of the current ayah — rendered as a ghost preview. */
  previewArabicText?: string;
  /** Font family for the preview text. */
  previewFontFamily?: string;
}

const SPRING = { damping: 22, stiffness: 200, mass: 0.8 } as const;

export function CustomBackgroundEditor({
  open,
  onClose,
  current,
  onApply,
  previewArabicText,
  previewFontFamily,
}: Props) {
  const { width: sw, height: sh } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  // ── State ─────────────────────────────────────────────────────────────────
  const [draftUri, setDraftUri] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  // ── Reanimated shared values (UI thread) ──────────────────────────────────
  const scale  = useSharedValue(1);
  const tx     = useSharedValue(0);
  const ty     = useSharedValue(0);

  // Baseline snapshots captured at gesture start
  const baseScale = useSharedValue(1);
  const baseTx    = useSharedValue(0);
  const baseTy    = useSharedValue(0);

  // Canvas dims shared with worklets
  const canvasW = useSharedValue(sw);
  const canvasH = useSharedValue(sh);

  // Keep canvas dims in sync with screen size changes
  useEffect(() => {
    canvasW.value = sw;
    canvasH.value = sh;
  }, [sw, sh, canvasW, canvasH]);

  // ── Clamp helper (runs on UI thread as worklet) ───────────────────────────
  // Ensures the image never exposes the black canvas background.
  function clamp(s: number, x: number, y: number) {
    "worklet";
    const cs   = Math.max(1.0, s);
    const maxX = ((cs - 1) / 2) * canvasW.value;
    const maxY = ((cs - 1) / 2) * canvasH.value;
    return {
      scale: cs,
      tx: Math.max(-maxX, Math.min(maxX, x)),
      ty: Math.max(-maxY, Math.min(maxY, y)),
    };
  }

  // ── Dirty flag helper ─────────────────────────────────────────────────────
  const updateDirty = useCallback((s: number, x: number, y: number) => {
    const dirty = Math.abs(s - 1) > 0.01 || Math.abs(x) > 0.5 || Math.abs(y) > 0.5;
    setIsDirty(dirty);
  }, []);

  // ── Gesture: pinch (scale) + pan (translate) run simultaneously ───────────
  // This mirrors UIKit's simultaneous recognizer pattern exactly.
  const pinch = Gesture.Pinch()
    .onStart(() => {
      "worklet";
      baseScale.value = scale.value;
    })
    .onUpdate((e) => {
      "worklet";
      const newScale = Math.max(1.0, baseScale.value * e.scale);
      const clamped  = clamp(newScale, tx.value, ty.value);
      scale.value    = clamped.scale;
      tx.value       = clamped.tx;
      ty.value       = clamped.ty;
    })
    .onEnd(() => {
      "worklet";
      const clamped = clamp(scale.value, tx.value, ty.value);
      scale.value   = withSpring(clamped.scale, SPRING);
      tx.value      = withSpring(clamped.tx,    SPRING);
      ty.value      = withSpring(clamped.ty,    SPRING);
      runOnJS(updateDirty)(clamped.scale, clamped.tx, clamped.ty);
    });

  const pan = Gesture.Pan()
    .minDistance(0)
    .onStart(() => {
      "worklet";
      baseTx.value = tx.value;
      baseTy.value = ty.value;
    })
    .onUpdate((e) => {
      "worklet";
      const clamped = clamp(scale.value, baseTx.value + e.translationX, baseTy.value + e.translationY);
      tx.value = clamped.tx;
      ty.value = clamped.ty;
    })
    .onEnd(() => {
      "worklet";
      const clamped = clamp(scale.value, tx.value, ty.value);
      tx.value = withSpring(clamped.tx, SPRING);
      ty.value = withSpring(clamped.ty, SPRING);
      runOnJS(updateDirty)(scale.value, clamped.tx, clamped.ty);
    });

  const gesture = Gesture.Simultaneous(pinch, pan);

  // ── Animated style for the image layer ───────────────────────────────────
  const imageStyle = useAnimatedStyle(() => ({
    transform: [
      { scale:      scale.value },
      { translateX: tx.value    },
      { translateY: ty.value    },
    ],
  }));

  // ── Load / reset when editor opens ────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    if (current) {
      const pixelTx = current.normalizedTx * sw;
      const pixelTy = current.normalizedTy * sh;
      setDraftUri(current.uri);
      scale.value = current.scale;
      tx.value    = pixelTx;
      ty.value    = pixelTy;
      baseScale.value = current.scale;
      baseTx.value    = pixelTx;
      baseTy.value    = pixelTy;
      setIsDirty(
        Math.abs(current.scale - 1) > 0.01 ||
        Math.abs(pixelTx) > 0.5 ||
        Math.abs(pixelTy) > 0.5,
      );
    } else {
      setDraftUri(null);
      scale.value = 1;
      tx.value    = 0;
      ty.value    = 0;
      baseScale.value = 1;
      baseTx.value    = 0;
      baseTy.value    = 0;
      setIsDirty(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, current]);

  // ── Mouse-wheel zoom (web) ────────────────────────────────────────────────
  useEffect(() => {
    if (Platform.OS !== "web" || !open) return;
    const handleWheel = (e: Event) => {
      const we = e as WheelEvent;
      we.preventDefault();
      const delta = we.deltaY < 0 ? 0.09 : -0.09;
      scale.value = Math.max(1.0, scale.value + delta);
    };
    const el = document.getElementById("cbg-canvas");
    if (el) {
      el.addEventListener("wheel", handleWheel, { passive: false });
      return () => el.removeEventListener("wheel", handleWheel);
    }
  }, [open, scale]);

  // ── Reset transform ────────────────────────────────────────────────────────
  const resetTransform = useCallback(() => {
    scale.value = withSpring(1, SPRING);
    tx.value    = withSpring(0, SPRING);
    ty.value    = withSpring(0, SPRING);
    setIsDirty(false);
  }, [scale, tx, ty]);

  // ── Pick photo ─────────────────────────────────────────────────────────────
  const pickImage = useCallback(async () => {
    setPicking(true);
    try {
      if (Platform.OS !== "web") {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== "granted") { setPicking(false); return; }
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"] as unknown as ImagePicker.MediaTypeOptions,
        allowsEditing: false,
        quality: 0.92,
      });
      if (!result.canceled && result.assets[0]) {
        let uri = result.assets[0].uri;
        if (Platform.OS === "web" && uri.startsWith("blob:")) {
          try {
            const resp = await fetch(uri);
            const blob = await resp.blob();
            if (blob.size < 4_000_000) {
              uri = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload  = () => resolve(reader.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
              });
            }
          } catch { /* keep blob URL */ }
        }
        setDraftUri(uri);
        scale.value = 1;
        tx.value    = 0;
        ty.value    = 0;
        setIsDirty(false);
      }
    } finally {
      setPicking(false);
    }
  }, [scale, tx, ty]);

  // ── Apply ──────────────────────────────────────────────────────────────────
  const handleApply = useCallback(() => {
    if (!draftUri) return;
    const clamped = clamp(scale.value, tx.value, ty.value);
    onApply({
      uri:          draftUri,
      scale:        clamped.scale,
      normalizedTx: sw > 0 ? clamped.tx / sw : 0,
      normalizedTy: sh > 0 ? clamped.ty / sh : 0,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftUri, onApply, sw, sh]);

  const hasMedia = draftUri !== null;
  const topPad   = insets.top + 8;
  const botPad   = insets.bottom + 28;

  return (
    <Modal
      visible={open}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
      statusBarTranslucent={Platform.OS === "android"}
    >
      <View style={styles.root}>

        {/* ── Full-screen gesture + image layer ─────────────────────────── */}
        <GestureDetector gesture={gesture}>
          <View nativeID="cbg-canvas" style={StyleSheet.absoluteFill}>
            {hasMedia && (
              <Animated.View style={[StyleSheet.absoluteFill, imageStyle]}>
                <Image
                  source={{ uri: draftUri! }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                />
              </Animated.View>
            )}

            {/* Dimming scrim — matches the app's default dim */}
            {hasMedia && (
              <LinearGradient
                colors={[
                  "rgba(0,0,0,0.55)",
                  "rgba(0,0,0,0.35)",
                  "rgba(0,0,0,0.55)",
                  "rgba(0,0,0,0.85)",
                ]}
                locations={[0, 0.25, 0.75, 1]}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              />
            )}

            {/* Ghost verse preview */}
            {hasMedia && previewArabicText && (
              <View style={styles.previewOverlay} pointerEvents="none">
                <Text
                  style={[
                    styles.previewText,
                    previewFontFamily ? { fontFamily: previewFontFamily } : undefined,
                  ]}
                  numberOfLines={4}
                >
                  {previewArabicText}
                </Text>
              </View>
            )}
          </View>
        </GestureDetector>

        {/* ── Placeholder (no photo selected) ───────────────────────────── */}
        {!hasMedia && (
          <TouchableOpacity
            style={styles.placeholder}
            onPress={pickImage}
            disabled={picking}
            activeOpacity={0.8}
          >
            <SymbolIcon
              name="photo.badge.plus"
              fallbackIonicon="add-circle-outline"
              size={52}
              color="rgba(255,255,255,0.25)"
            />
            <Text style={styles.placeholderLabel}>Choose a Photo</Text>
            <Text style={styles.placeholderSub}>
              Tap anywhere to pick from your library
            </Text>
          </TouchableOpacity>
        )}

        {/* ── Floating controls ─────────────────────────────────────────── */}
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">

          {/* Top bar */}
          <View style={[styles.topBar, { top: topPad }]} pointerEvents="box-none">
            <TouchableOpacity
              onPress={onClose}
              hitSlop={14}
              style={styles.topBarBtn}
              activeOpacity={0.65}
            >
              <View style={styles.topBarPill}>
                <Text style={styles.cancelLabel}>Cancel</Text>
              </View>
            </TouchableOpacity>

            <View style={styles.topBarPill} pointerEvents="none">
              <Text style={styles.titleLabel} numberOfLines={1}>
                {hasMedia ? "Adjust Photo" : "Custom Background"}
              </Text>
            </View>

            <TouchableOpacity
              onPress={handleApply}
              hitSlop={14}
              style={[styles.topBarBtn, styles.topBarBtnRight]}
              activeOpacity={hasMedia ? 0.65 : 1}
              disabled={!hasMedia}
            >
              <View style={[styles.topBarPill, !hasMedia && styles.topBarPillHidden]}>
                <Text style={styles.setLabel}>Set</Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* Reset pill */}
          {hasMedia && isDirty && (
            <View
              style={[styles.resetWrap, { bottom: botPad + 72 }]}
              pointerEvents="box-none"
            >
              <TouchableOpacity
                onPress={resetTransform}
                activeOpacity={0.72}
                style={styles.resetPill}
              >
                <SymbolIcon
                  name="arrow.counterclockwise"
                  fallbackIonicon="refresh"
                  size={12}
                  color="rgba(255,255,255,0.88)"
                />
                <Text style={styles.resetPillText}>Reset</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Bottom photo picker pill */}
          {hasMedia && (
            <View style={[styles.bottomBar, { bottom: botPad }]} pointerEvents="box-none">
              <TouchableOpacity
                onPress={pickImage}
                disabled={picking}
                activeOpacity={0.75}
                style={styles.photoBtn}
              >
                <SymbolIcon
                  name="photo"
                  fallbackIonicon="image-outline"
                  size={16}
                  color={picking ? "rgba(232,192,120,0.4)" : "#e8c078"}
                />
                <Text style={[styles.photoBtnLabel, picking && styles.photoBtnLabelDim]}>
                  Change Photo
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#080808",
  },
  previewOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  previewText: {
    fontSize: 30,
    lineHeight: 52,
    color: "rgba(255,255,255,0.88)",
    textAlign: "center",
    writingDirection: "rtl",
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },
  placeholder: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  placeholderLabel: {
    fontSize: 17,
    fontWeight: "600",
    color: "rgba(255,255,255,0.55)",
    letterSpacing: -0.3,
    marginTop: 4,
  },
  placeholderSub: {
    fontSize: 13,
    color: "rgba(255,255,255,0.25)",
  },
  topBar: {
    position: "absolute",
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  topBarBtn: {
    minWidth: 72,
  },
  topBarBtnRight: {
    alignItems: "flex-end",
  },
  topBarPill: {
    backgroundColor: "rgba(0,0,0,0.48)",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.12)",
  },
  topBarPillHidden: {
    opacity: 0,
  },
  cancelLabel: {
    fontSize: 15,
    fontWeight: "500",
    color: "rgba(255,255,255,0.85)",
  },
  titleLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: "rgba(255,255,255,0.7)",
    letterSpacing: -0.2,
  },
  setLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: "#e8c078",
  },
  resetWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  resetPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.52)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.14)",
  },
  resetPillText: {
    fontSize: 13,
    fontWeight: "500",
    color: "rgba(255,255,255,0.9)",
    letterSpacing: -0.1,
  },
  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  photoBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 11,
    paddingHorizontal: 20,
    borderRadius: 24,
    backgroundColor: "rgba(0,0,0,0.52)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.14)",
  },
  photoBtnLabel: {
    fontSize: 15,
    fontWeight: "500",
    color: "rgba(255,255,255,0.85)",
    letterSpacing: -0.2,
  },
  photoBtnLabelDim: {
    color: "rgba(255,255,255,0.3)",
  },
});
