import { LinearGradient } from "expo-linear-gradient";
import React, {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  Animated,
  Easing,
  Platform,
  StyleSheet,
  Text,
  TextStyle,
  View,
} from "react-native";

// ── Apple Music–style constants ──────────────────────────────────────────────
const INITIAL_DELAY_MS  = 1200;
const LOOP_PAUSE_MS     = 2000;
const PIXELS_PER_SECOND = 38;
const GAP_PX            = 60;
const FADE_WIDTH        = 14;

const FADE_MASK = `linear-gradient(to right, transparent 0%, #000 ${FADE_WIDTH}px, #000 calc(100% - ${FADE_WIDTH}px), transparent 100%)`;

// Any realistic reciter name at our font size fits within 2000 px.
const MEASURER_MAX_W = 2000;

type Props = {
  children: string;
  style?: TextStyle | TextStyle[];
};

export function MarqueeText({ children, style }: Props) {
  const [containerW, setContainerW] = useState(0);
  const [naturalW, setNaturalW]     = useState(0);
  const translateX = useRef(new Animated.Value(0)).current;
  const animRef    = useRef<Animated.CompositeAnimation | null>(null);

  const overflows = containerW > 0 && naturalW > containerW;

  // ── Web text measurement ──────────────────────────────────────────────────
  // React Native's StyleSheet normalizer strips non-standard CSS values,
  // so we append an off-screen <span> to measure the natural text width.
  useLayoutEffect(() => {
    if (Platform.OS !== "web") return;
    const span = document.createElement("span");
    span.style.cssText =
      "position:fixed;top:-9999px;left:-9999px;white-space:nowrap;" +
      "visibility:hidden;pointer-events:none;";
    const flat = StyleSheet.flatten(style) ?? {};
    if (flat.fontSize)      span.style.fontSize      = `${flat.fontSize}px`;
    if (flat.fontWeight)    span.style.fontWeight     = String(flat.fontWeight);
    if (flat.fontFamily)    span.style.fontFamily     = String(flat.fontFamily);
    if (flat.letterSpacing) span.style.letterSpacing  = `${flat.letterSpacing}px`;
    span.textContent = children;
    document.body.appendChild(span);
    const w = span.getBoundingClientRect().width;
    document.body.removeChild(span);
    if (w > 0) setNaturalW(w);
  }, [children, style]);

  // ── Reset state when text changes (native) ────────────────────────────────
  // Stop any running animation and clear the measured naturalW so the
  // measurer's onTextLayout fires fresh for the new text.
  useEffect(() => {
    if (Platform.OS === "web") return;
    animRef.current?.stop();
    animRef.current = null;
    translateX.setValue(0);
    setNaturalW(0);
  }, [children, translateX]);

  // ── Animation ─────────────────────────────────────────────────────────────
  // NOTE: deliberately NOT wrapped in useCallback. The React Compiler
  // (enabled in this project) can over-aggressively memoize useCallback,
  // causing the stale closure (overflows=false) to persist after measurement
  // fires and overflows becomes true. Inlining the logic here ensures the
  // effect always re-runs with fresh values when deps change.
  useEffect(() => {
    if (!overflows) {
      animRef.current?.stop();
      animRef.current = null;
      translateX.setValue(0);
      return;
    }

    const travel         = naturalW + GAP_PX;
    const scrollDuration = (travel / PIXELS_PER_SECOND) * 1000;

    const anim = Animated.loop(
      Animated.sequence([
        // Use the `delay` option on Animated.timing instead of Animated.delay().
        // Animated.delay() uses useNativeDriver:false which breaks native-driver
        // sequences on iOS/Android.
        Animated.timing(translateX, {
          toValue:         -travel,
          duration:        scrollDuration,
          delay:           INITIAL_DELAY_MS,
          easing:          Easing.linear,
          useNativeDriver: true,
        }),
        // Instant reset — second copy is now exactly where first was → seamless.
        Animated.timing(translateX, {
          toValue:         0,
          duration:        1,
          delay:           LOOP_PAUSE_MS,
          useNativeDriver: true,
        }),
      ]),
    );
    animRef.current = anim;
    anim.start();

    return () => {
      anim.stop();
    };
  }, [overflows, naturalW, translateX]);

  // ── Gradient edge fade ─────────────────────────────────────────────────────
  // Web: CSS mask-image for a smooth hardware-accelerated fade.
  // Native: expo-linear-gradient overlays (transparent→bg, bg→transparent)
  // pinned to left/right edges of the clip container.
  const webClipStyle =
    overflows && Platform.OS === "web"
      ? [
          styles.clip,
          {
            maskImage:       FADE_MASK,
            WebkitMaskImage: FADE_MASK,
          } as object,
        ]
      : styles.clip;

  return (
    <View
      style={styles.root}
      onLayout={(e) => setContainerW(e.nativeEvent.layout.width)}
    >
      {/* ── Invisible measurer ───────────────────────────────────────────────
           Web: naturalW is set via the useLayoutEffect span above.
           Native: onTextLayout gives the actual rendered glyph width. */}
      <View
        key={children}
        style={styles.measurerWrap}
        pointerEvents="none"
        accessible={false}
      >
        <Text
          style={[style, styles.measurerText]}
          numberOfLines={1}
          onTextLayout={
            Platform.OS !== "web"
              ? (e) => {
                  const w = e.nativeEvent.lines[0]?.width ?? 0;
                  if (w > 0) setNaturalW(Math.ceil(w));
                }
              : undefined
          }
          accessibilityElementsHidden
          importantForAccessibility="no"
        >
          {children}
        </Text>
      </View>

      {/* ── Clipping container with gradient mask ── */}
      <View style={webClipStyle as any}>
        {overflows ? (
          <Animated.View
            style={[styles.row, { transform: [{ translateX }] }]}
          >
            <Text style={[style, { flexShrink: 0 }]} numberOfLines={1}>
              {children}
            </Text>
            <Text style={[style, { paddingLeft: GAP_PX, flexShrink: 0 }]} numberOfLines={1}>
              {children}
            </Text>
          </Animated.View>
        ) : (
          <Text style={style} numberOfLines={1}>
            {children}
          </Text>
        )}

        {/* Native gradient overlays — left and right edge fades.
            Transparent → opaque black matches the player's dark background. */}
        {overflows && Platform.OS !== "web" && (
          <>
            <LinearGradient
              pointerEvents="none"
              colors={["rgba(0,0,0,1)", "rgba(0,0,0,0)"]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={[styles.fadeEdge, styles.fadeLeft]}
            />
            <LinearGradient
              pointerEvents="none"
              colors={["rgba(0,0,0,0)", "rgba(0,0,0,1)"]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={[styles.fadeEdge, styles.fadeRight]}
            />
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex:     1,
    minWidth: 0,
    overflow: "visible",
  },
  measurerWrap: {
    position:   "absolute",
    top:        0,
    left:       0,
    width:      MEASURER_MAX_W,
    opacity:    0,
    overflow:   "hidden",
    // alignItems:"flex-start" lets the Text size to its content width rather
    // than stretching to fill the 2000 px container. Without this, onLayout
    // (if used) would report naturalW = 2000 and travel ≈ 54 s.
    alignItems: "flex-start",
  },
  measurerText: {
    // Inherits all font styles from the prop.
  },
  clip: {
    overflow: "hidden",
    paddingVertical: 4,
    position: "relative",
  },
  row: {
    flexDirection: "row",
    alignSelf:     "flex-start",
  },
  fadeEdge: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: FADE_WIDTH,
  },
  fadeLeft: {
    left: 0,
  },
  fadeRight: {
    right: 0,
  },
});
