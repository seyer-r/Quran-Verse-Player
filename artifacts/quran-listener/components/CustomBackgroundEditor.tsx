/**
 * CustomBackgroundEditor — Apple-style full-screen wallpaper editor.
 *
 * The photo fills the entire screen as a live preview (same gradient and
 * verse overlay as the real player). Cancel / Set float over the image at
 * the top; a photo-picker pill floats at the bottom. Pan and pinch directly
 * on the full screen — no canvas box.
 */

import { useCallback, useEffect, useRef, useState } from "react";
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

  // ── Refs ──────────────────────────────────────────────────────────────────
  const draftUriRef = useRef<string | null>(null);
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const translateXAnim = useRef(new Animated.Value(0)).current;
  const translateYAnim = useRef(new Animated.Value(0)).current;
  const currentScaleRef = useRef(1);
  const currentTxRef = useRef(0);
  const currentTyRef = useRef(0);
  const gestureRef = useRef({
    pivotX:      0,
    pivotY:      0,
    baseTx:      0,
    baseTy:      0,
    baseScale:   1,
    isMultiTouch: false,
    mtMidX:      0,
    mtMidY:      0,
    mtDist:      1,
    lastScale:   1,
    lastTx:      0,
    lastTy:      0,
  });
  const clampRef = useRef<
    (s: number, x: number, y: number) => { scale: number; tx: number; ty: number }
  >((s, x, y) => ({ scale: s, tx: x, ty: y }));
  const canvasDimsRef = useRef({ w: sw, h: sh });
  const isDirtyRef      = useRef(false);
  const resetBtnOpacity = useRef(new Animated.Value(0)).current;

  // Canvas = full screen
  const mW = sw;
  const mH = sh;

  // ── Sync live refs each render ────────────────────────────────────────────
  draftUriRef.current = draftUri;
  canvasDimsRef.current = { w: mW, h: mH };
  clampRef.current = (scale, tx, ty) => {
    const cs = Math.max(1.0, scale);
    const maxTx = ((cs - 1) / 2) * canvasDimsRef.current.w;
    const maxTy = ((cs - 1) / 2) * canvasDimsRef.current.h;
    return {
      scale: cs,
      tx: Math.max(-maxTx, Math.min(maxTx, tx)),
      ty: Math.max(-maxTy, Math.min(maxTy, ty)),
    };
  };

  // ── PanResponder ──────────────────────────────────────────────────────────
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => draftUriRef.current !== null,
      onMoveShouldSetPanResponder: () => draftUriRef.current !== null,
      onStartShouldSetPanResponderCapture: (evt) =>
        draftUriRef.current !== null && evt.nativeEvent.touches.length >= 2,
      onMoveShouldSetPanResponderCapture: () => draftUriRef.current !== null,
      onPanResponderGrant: (evt) => {
        const g = gestureRef.current;
        const t = evt.nativeEvent.touches;
        g.baseScale   = currentScaleRef.current;
        g.baseTx      = currentTxRef.current;
        g.baseTy      = currentTyRef.current;
        g.lastScale   = currentScaleRef.current;
        g.lastTx      = currentTxRef.current;
        g.lastTy      = currentTyRef.current;
        g.isMultiTouch = false;
        if (t && t.length >= 2) {
          g.isMultiTouch = true;
          const midX = (t[0].pageX + t[1].pageX) / 2;
          const midY = (t[0].pageY + t[1].pageY) / 2;
          const dx = t[1].pageX - t[0].pageX;
          const dy = t[1].pageY - t[0].pageY;
          g.mtMidX = midX;
          g.mtMidY = midY;
          g.mtDist = Math.sqrt(dx * dx + dy * dy) || 1;
        } else if (t && t.length >= 1) {
          g.pivotX = t[0].pageX;
          g.pivotY = t[0].pageY;
        }
      },
      onPanResponderMove: (evt) => {
        const g = gestureRef.current;
        const t = evt.nativeEvent.touches;
        if (!t || t.length === 0) return;
        if (t.length >= 2) {
          const midX = (t[0].pageX + t[1].pageX) / 2;
          const midY = (t[0].pageY + t[1].pageY) / 2;
          const dx = t[1].pageX - t[0].pageX;
          const dy = t[1].pageY - t[0].pageY;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          if (!g.isMultiTouch) {
            g.isMultiTouch = true;
            g.baseTx   = g.lastTx;
            g.baseTy   = g.lastTy;
            g.baseScale = g.lastScale;
            g.mtMidX   = midX;
            g.mtMidY   = midY;
            g.mtDist   = dist;
          }
          const newScale = Math.max(1.0, g.baseScale * (dist / g.mtDist));
          const newTx = g.baseTx + (midX - g.mtMidX);
          const newTy = g.baseTy + (midY - g.mtMidY);
          scaleAnim.setValue(newScale);
          translateXAnim.setValue(newTx);
          translateYAnim.setValue(newTy);
          g.lastScale = newScale;
          g.lastTx = newTx;
          g.lastTy = newTy;
        } else {
          if (g.isMultiTouch) {
            g.isMultiTouch = false;
            g.baseTx  = g.lastTx;
            g.baseTy  = g.lastTy;
            g.pivotX  = t[0].pageX;
            g.pivotY  = t[0].pageY;
          }
          const newTx = g.baseTx + (t[0].pageX - g.pivotX);
          const newTy = g.baseTy + (t[0].pageY - g.pivotY);
          translateXAnim.setValue(newTx);
          translateYAnim.setValue(newTy);
          g.lastTx = newTx;
          g.lastTy = newTy;
        }
      },
      onPanResponderRelease: () => {
        const g = gestureRef.current;
        const clamped = clampRef.current(g.lastScale, g.lastTx, g.lastTy);
        const needs =
          clamped.scale !== g.lastScale ||
          clamped.tx    !== g.lastTx    ||
          clamped.ty    !== g.lastTy;
        if (needs) {
          Animated.parallel([
            Animated.spring(scaleAnim,      { toValue: clamped.scale, useNativeDriver: true, tension: 200, friction: 22 }),
            Animated.spring(translateXAnim, { toValue: clamped.tx,    useNativeDriver: true, tension: 200, friction: 22 }),
            Animated.spring(translateYAnim, { toValue: clamped.ty,    useNativeDriver: true, tension: 200, friction: 22 }),
          ]).start();
        }
        currentScaleRef.current = clamped.scale;
        currentTxRef.current    = clamped.tx;
        currentTyRef.current    = clamped.ty;
        g.lastScale = clamped.scale;
        g.lastTx    = clamped.tx;
        g.lastTy    = clamped.ty;
        const dirty = Math.abs(clamped.scale - 1) > 0.01
                   || Math.abs(clamped.tx) > 0.5
                   || Math.abs(clamped.ty) > 0.5;
        if (dirty !== isDirtyRef.current) {
          isDirtyRef.current = dirty;
          Animated.timing(resetBtnOpacity, {
            toValue: dirty ? 1 : 0, duration: 220, useNativeDriver: true,
          }).start();
        }
      },
      onPanResponderTerminate: () => {
        const g = gestureRef.current;
        currentScaleRef.current = g.lastScale;
        currentTxRef.current    = g.lastTx;
        currentTyRef.current    = g.lastTy;
      },
    }),
  ).current;

  // ── Effect: load / reset when editor opens ────────────────────────────────
  useEffect(() => {
    if (!open) return;
    if (current) {
      const pixelTx = current.normalizedTx * canvasDimsRef.current.w;
      const pixelTy = current.normalizedTy * canvasDimsRef.current.h;
      setDraftUri(current.uri);
      scaleAnim.setValue(current.scale);
      translateXAnim.setValue(pixelTx);
      translateYAnim.setValue(pixelTy);
      currentScaleRef.current = current.scale;
      currentTxRef.current    = pixelTx;
      currentTyRef.current    = pixelTy;
      gestureRef.current.lastScale = current.scale;
      gestureRef.current.lastTx    = pixelTx;
      gestureRef.current.lastTy    = pixelTy;
    } else {
      setDraftUri(null);
      scaleAnim.setValue(1);
      translateXAnim.setValue(0);
      translateYAnim.setValue(0);
      currentScaleRef.current = 1;
      currentTxRef.current    = 0;
      currentTyRef.current    = 0;
      gestureRef.current.lastScale = 1;
      gestureRef.current.lastTx    = 0;
      gestureRef.current.lastTy    = 0;
    }
  }, [open, current, scaleAnim, translateXAnim, translateYAnim]);

  // ── Mouse-wheel zoom (web) ────────────────────────────────────────────────
  useEffect(() => {
    if (Platform.OS !== "web" || !open) return;
    const handleWheel = (e: Event) => {
      const we = e as WheelEvent;
      we.preventDefault();
      const delta = we.deltaY < 0 ? 0.09 : -0.09;
      const newScale = Math.max(1.0, currentScaleRef.current + delta);
      scaleAnim.setValue(newScale);
      gestureRef.current.lastScale = newScale;
      currentScaleRef.current = newScale;
    };
    const el = document.getElementById("cbg-canvas");
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
    currentTxRef.current    = 0;
    currentTyRef.current    = 0;
    gestureRef.current.lastScale = 1;
    gestureRef.current.lastTx    = 0;
    gestureRef.current.lastTy    = 0;
    isDirtyRef.current = false;
    resetBtnOpacity.setValue(0);
  }, [scaleAnim, translateXAnim, translateYAnim, resetBtnOpacity]);

  const resetTransformAnimated = useCallback(() => {
    Animated.parallel([
      Animated.spring(scaleAnim,      { toValue: 1, useNativeDriver: true, tension: 180, friction: 18 }),
      Animated.spring(translateXAnim, { toValue: 0, useNativeDriver: true, tension: 180, friction: 18 }),
      Animated.spring(translateYAnim, { toValue: 0, useNativeDriver: true, tension: 180, friction: 18 }),
    ]).start();
    currentScaleRef.current = 1;
    currentTxRef.current    = 0;
    currentTyRef.current    = 0;
    gestureRef.current.lastScale = 1;
    gestureRef.current.lastTx    = 0;
    gestureRef.current.lastTy    = 0;
    isDirtyRef.current = false;
    Animated.timing(resetBtnOpacity, {
      toValue: 0, duration: 180, useNativeDriver: true,
    }).start();
  }, [scaleAnim, translateXAnim, translateYAnim, resetBtnOpacity]);

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
        resetTransform();
      }
    } finally {
      setPicking(false);
    }
  }, [resetTransform]);

  const handleApply = useCallback(() => {
    if (!draftUri) return;
    const clamped  = clampRef.current(currentScaleRef.current, currentTxRef.current, currentTyRef.current);
    const { w, h } = canvasDimsRef.current;
    onApply({
      uri:          draftUri,
      scale:        clamped.scale,
      normalizedTx: w > 0 ? clamped.tx / w : 0,
      normalizedTy: h > 0 ? clamped.ty / h : 0,
    });
  }, [draftUri, onApply]);

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
        <View
          nativeID="cbg-canvas"
          style={StyleSheet.absoluteFill}
          {...panResponder.panHandlers}
        >
          {/* Photo */}
          {hasMedia && (
            <Animated.View
              style={[
                StyleSheet.absoluteFill,
                {
                  transform: [
                    { scale:      scaleAnim      },
                    { translateX: translateXAnim  },
                    { translateY: translateYAnim  },
                  ],
                },
              ]}
              pointerEvents="none"
            >
              <Image
                source={{ uri: draftUri! }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
              />
            </Animated.View>
          )}

          {/* Dimming scrim — matches the app's default dim setting */}
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

          {/* Ghost verse preview — shows how the text will look */}
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

        {/* ── Floating controls (rendered above gesture layer) ───────────── */}
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">

          {/* Top bar: Cancel / title / Set */}
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

          {/* Reset pill — fades in when transform is non-identity */}
          {hasMedia && (
            <Animated.View
              style={[styles.resetWrap, { bottom: botPad + 72 }, { opacity: resetBtnOpacity }]}
              pointerEvents="box-none"
            >
              <TouchableOpacity
                onPress={resetTransformAnimated}
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
            </Animated.View>
          )}

          {/* Bottom: photo picker pill */}
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

  // ── Preview ────────────────────────────────────────────────────────────────
  previewOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  previewText: {
    fontSize: 30,
    lineHeight: 52,
    color: "rgba(255,255,255,0.22)",
    textAlign: "center",
    writingDirection: "rtl",
  },

  // ── Placeholder ────────────────────────────────────────────────────────────
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
    letterSpacing: 0,
  },

  // ── Top bar ────────────────────────────────────────────────────────────────
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

  // ── Reset pill ─────────────────────────────────────────────────────────────
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

  // ── Bottom bar ─────────────────────────────────────────────────────────────
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
