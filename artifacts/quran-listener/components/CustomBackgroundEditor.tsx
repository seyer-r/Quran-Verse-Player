/**
 * CustomBackgroundEditor
 *
 * Full-screen modal where the user picks a photo and repositions it
 * inside a plain preview rectangle.
 *
 * Layout:
 *   [Cancel]   Adjust Background   [Set]
 *
 *   ┌───────────────────────────────────┐
 *   │                                   │
 *   │        (image / placeholder)      │
 *   │                                   │
 *   └───────────────────────────────────┘
 *   Drag to reposition · Pinch or scroll to zoom
 *
 *   ┌──────────────────────────────────┐
 *   │  📷  Choose Photo        ›       │
 *   └──────────────────────────────────┘
 *
 * Gesture note:
 *   The modal uses presentationStyle="fullScreen" on iOS (no pull-to-dismiss
 *   handle). This is intentional — Apple's own image-editing UIs (Photos,
 *   Procreate, Keynote canvas) do the same: editing screens are fullScreen so
 *   the dismiss gesture never conflicts with canvas pan gestures. The user
 *   taps Cancel to exit. On Android the modal is always fullScreen.
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

const CANVAS_RADIUS = 14;
const CANVAS_ASPECT = 19.5 / 9; // portrait — matches the actual app screen ratio

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
  const [picking, setPicking] = useState(false);

  // ── ALL refs declared before any effect ───────────────────────────────────
  const draftUriRef = useRef<string | null>(null);
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const translateXAnim = useRef(new Animated.Value(0)).current;
  const translateYAnim = useRef(new Animated.Value(0)).current;
  const currentScaleRef = useRef(1);
  const currentTxRef = useRef(0);
  const currentTyRef = useRef(0);
  const gestureRef = useRef({
    // ── Single-touch baseline ─────────────────────────────────────────────
    // Absolute page coords of the initial touch; baseTx/Ty = transform when
    // this single-touch phase started.  Using absolute coords (not s.dx/s.dy)
    // lets us re-anchor cleanly when finger count changes mid-gesture.
    pivotX:      0,
    pivotY:      0,
    baseTx:      0,
    baseTy:      0,
    baseScale:   1,
    // ── Multi-touch baseline ──────────────────────────────────────────────
    // Snapshot taken the moment a second finger touches down (or when the
    // gesture starts with two fingers).  Reset each time we enter 2-finger mode.
    isMultiTouch: false,
    mtMidX:      0,   // initial midpoint X of the two fingers
    mtMidY:      0,   // initial midpoint Y of the two fingers
    mtDist:      1,   // initial distance between the two fingers
    // ── Latest committed values (read on release for clamping) ────────────
    lastScale:   1,
    lastTx:      0,
    lastTy:      0,
  });
  const clampRef = useRef<
    (s: number, x: number, y: number) => { scale: number; tx: number; ty: number }
  >((s, x, y) => ({ scale: s, tx: x, ty: y }));
  const canvasDimsRef = useRef({ w: 0, h: 0 });
  // Tracks whether transform differs from identity — drives the Reset button.
  const isDirtyRef       = useRef(false);
  const resetBtnOpacity  = useRef(new Animated.Value(0)).current;

  // ── Canvas dimensions ──────────────────────────────────────────────────────
  // NAV_H + instruction + picker card + safe areas = ~232px fixed chrome.
  // The remainder is available for the canvas.
  const NAV_H = 56;
  const BOTTOM_CHROME = 40 + 120 + insets.bottom + 20; // hint + card + padding
  const availH = sh - (Platform.OS === "ios" ? 0 : insets.top) - NAV_H - BOTTOM_CHROME - 16;
  const availW = sw - 40; // 20px side padding each side
  let mH = Math.min(Math.max(availH, 240), 520);
  let mW = mH / CANVAS_ASPECT;
  if (mW > availW) {
    mW = availW;
    mH = mW * CANVAS_ASPECT;
  }

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
      // Immediately capture two-finger touches so pinch works in all directions
      // (diagonal, horizontal, vertical) — matching UIPinchGestureRecognizer.
      // Single-finger capture is deferred to onMove so child taps still fire.
      onStartShouldSetPanResponderCapture: (evt) =>
        draftUriRef.current !== null && evt.nativeEvent.touches.length >= 2,
      onMoveShouldSetPanResponderCapture: () => draftUriRef.current !== null,
      onPanResponderGrant: (evt) => {
        const g = gestureRef.current;
        const t = evt.nativeEvent.touches;

        // Snapshot the current transform as the baseline for this gesture.
        g.baseScale  = currentScaleRef.current;
        g.baseTx     = currentTxRef.current;
        g.baseTy     = currentTyRef.current;
        g.lastScale  = currentScaleRef.current;
        g.lastTx     = currentTxRef.current;
        g.lastTy     = currentTyRef.current;
        g.isMultiTouch = false;

        if (t && t.length >= 2) {
          // Started with two fingers — initialise multi-touch baseline.
          g.isMultiTouch = true;
          const midX = (t[0].pageX + t[1].pageX) / 2;
          const midY = (t[0].pageY + t[1].pageY) / 2;
          const dx   = t[1].pageX - t[0].pageX;
          const dy   = t[1].pageY - t[0].pageY;
          g.mtMidX = midX;
          g.mtMidY = midY;
          g.mtDist = Math.sqrt(dx * dx + dy * dy) || 1;
        } else if (t && t.length >= 1) {
          // Single finger — record the absolute touch anchor.
          g.pivotX = t[0].pageX;
          g.pivotY = t[0].pageY;
        }
      },
      onPanResponderMove: (evt) => {
        const g = gestureRef.current;
        const t = evt.nativeEvent.touches;
        if (!t || t.length === 0) return;

        if (t.length >= 2) {
          // ── Two-finger: simultaneous pan + pinch ────────────────────────
          const midX = (t[0].pageX + t[1].pageX) / 2;
          const midY = (t[0].pageY + t[1].pageY) / 2;
          const dx   = t[1].pageX - t[0].pageX;
          const dy   = t[1].pageY - t[0].pageY;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;

          if (!g.isMultiTouch) {
            // A second finger arrived mid-gesture: lock current state as the
            // new baseline so there is no position/scale jump.
            g.isMultiTouch = true;
            g.baseTx       = g.lastTx;
            g.baseTy       = g.lastTy;
            g.baseScale    = g.lastScale;
            g.mtMidX       = midX;
            g.mtMidY       = midY;
            g.mtDist       = dist;
          }

          // Scale from the baseline; always ≥ 1 so the image never shrinks
          // below its "fill" size and exposes the black canvas background.
          const newScale = Math.max(1.0, g.baseScale * (dist / g.mtDist));
          // Pan: follow the midpoint of the two fingers.
          const newTx   = g.baseTx + (midX - g.mtMidX);
          const newTy   = g.baseTy + (midY - g.mtMidY);

          scaleAnim.setValue(newScale);
          translateXAnim.setValue(newTx);
          translateYAnim.setValue(newTy);
          g.lastScale = newScale;
          g.lastTx    = newTx;
          g.lastTy    = newTy;

        } else {
          // ── Single finger: pan only ──────────────────────────────────────
          if (g.isMultiTouch) {
            // Second finger just lifted: re-anchor single-touch to avoid a jump.
            g.isMultiTouch = false;
            g.baseTx       = g.lastTx;
            g.baseTy       = g.lastTy;
            g.pivotX       = t[0].pageX;
            g.pivotY       = t[0].pageY;
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
        const g       = gestureRef.current;
        const clamped = clampRef.current(g.lastScale, g.lastTx, g.lastTy);
        const needs   =
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
        // Show/hide the Reset button based on whether transform is non-identity.
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

  // ── Effect: mouse-wheel zoom (web only) ───────────────────────────────────
  useEffect(() => {
    if (Platform.OS !== "web" || !open) return;
    const handleWheel = (e: Event) => {
      const we    = e as WheelEvent;
      we.preventDefault();
      const delta    = we.deltaY < 0 ? 0.09 : -0.09;
      const newScale = Math.max(0.3, currentScaleRef.current + delta);
      scaleAnim.setValue(newScale);
      gestureRef.current.lastScale = newScale;
      currentScaleRef.current      = newScale;
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

  // Spring-animated reset — used by the Reset pill button.
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
    const clamped   = clampRef.current(currentScaleRef.current, currentTxRef.current, currentTyRef.current);
    const { w, h }  = canvasDimsRef.current;
    onApply({
      uri:          draftUri,
      scale:        clamped.scale,
      normalizedTx: w > 0 ? clamped.tx / w : 0,
      normalizedTy: h > 0 ? clamped.ty / h : 0,
    });
  }, [draftUri, onApply]);

  const hasMedia = draftUri !== null;

  return (
    <Modal
      visible={open}
      // fullScreen on iOS removes the pull-to-dismiss handle that conflicts
      // with pan gestures on the canvas. This matches Apple's Photos/Keynote
      // editing pattern — use Cancel to exit deliberately.
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
      statusBarTranslucent={Platform.OS === "android"}
    >
      <View
        style={[
          styles.container,
          { paddingTop: Platform.OS === "ios" ? insets.top : insets.top },
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

        {/* ── Canvas area ───────────────────────────────────────────── */}
        <View style={styles.canvasArea}>
          <View
            nativeID="cbg-canvas"
            style={[
              styles.canvas,
              { width: mW, height: mH },
              Platform.OS === "web"
                ? ({ boxShadow: "0 20px 60px rgba(0,0,0,0.85)" } as object)
                : {
                    shadowColor: "#000",
                    shadowOpacity: 0.85,
                    shadowRadius: 32,
                    shadowOffset: { width: 0, height: 14 },
                    elevation: 32,
                  },
            ]}
            {...panResponder.panHandlers}
          >
            {/* Background media with transform */}
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

            {/* Subtle edge vignette when media present */}
            {hasMedia && (
              <LinearGradient
                colors={[
                  "rgba(0,0,0,0.28)",
                  "transparent",
                  "transparent",
                  "rgba(0,0,0,0.28)",
                ]}
                locations={[0, 0.25, 0.75, 1]}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              />
            )}

            {/* Reset pill — fades in when transform is non-identity */}
            {hasMedia && (
              <Animated.View
                style={[styles.resetWrap, { opacity: resetBtnOpacity }]}
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

            {/* Placeholder when no media selected */}
            {!hasMedia && (
              <View style={styles.placeholder} pointerEvents="none">
                <View style={styles.placeholderGlow}>
                  <SymbolIcon
                    name="photo.on.rectangle"
                    fallbackIonicon="images-outline"
                    size={40}
                    color="#4a4a4e"
                  />
                </View>
                <Text style={styles.placeholderText}>
                  Your photo{"\n"}will appear here
                </Text>
                <Text style={styles.placeholderHint}>
                  Choose one below to get started
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* ── Instruction hint ──────────────────────────────────────── */}
        <Text style={[styles.instruction, { opacity: hasMedia ? 1 : 0 }]}>
          Drag to reposition · Pinch or scroll to zoom
        </Text>

        {/* ── Media picker card ─────────────────────────────────────── */}
        <View style={[styles.pickerCard, { marginBottom: insets.bottom + 20 }]}>
          <TouchableOpacity
            onPress={pickImage}
            activeOpacity={0.65}
            style={styles.pickerRow}
            disabled={picking}
          >
            <SymbolIcon
              name="photo"
              fallbackIonicon="image-outline"
              size={19}
              color={picking ? "#3a3a3c" : "#e8c078"}
            />
            <Text style={[styles.pickerRowLabel, picking && styles.pickerRowLabelDim]}>
              Choose Photo
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

  // ── Canvas ─────────────────────────────────────────────────────────────────
  canvasArea: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  canvas: {
    borderRadius: CANVAS_RADIUS,
    overflow: "hidden",
    backgroundColor: "#111",
  },

  // ── Placeholder ────────────────────────────────────────────────────────────
  placeholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  placeholderGlow: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: "rgba(232,192,120,0.05)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  placeholderText: {
    fontSize: 13,
    color: "#4a4a4e",
    textAlign: "center",
    lineHeight: 19,
  },
  placeholderHint: {
    fontSize: 11,
    color: "#2e2e30",
    textAlign: "center",
    marginTop: 2,
  },

  // ── Reset pill ─────────────────────────────────────────────────────────────
  resetWrap: {
    position:  "absolute",
    bottom:    16,
    left:      0,
    right:     0,
    alignItems: "center",
  },
  resetPill: {
    flexDirection:   "row",
    alignItems:      "center",
    gap:             6,
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius:    20,
    backgroundColor: "rgba(0,0,0,0.52)",
    borderWidth:     StyleSheet.hairlineWidth,
    borderColor:     "rgba(255,255,255,0.14)",
  },
  resetPillText: {
    fontSize:      13,
    fontWeight:    "500",
    color:         "rgba(255,255,255,0.9)",
    letterSpacing: -0.1,
  },

  // ── Instruction ────────────────────────────────────────────────────────────
  instruction: {
    textAlign: "center",
    fontSize: 13,
    color: "#555",
    paddingVertical: 12,
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
    paddingHorizontal: 16,
    paddingVertical: 15,
    gap: 12,
  },
  pickerRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  pickerRowLabel: {
    flex: 1,
    fontSize: 16,
    color: "#e8e8e8",
    fontWeight: "400",
  },
  pickerRowLabelDim: {
    color: "#3a3a3c",
  },
});
