import React, {
  useCallback,
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
const INITIAL_DELAY_MS  = 2000;  // pause before first scroll (~2 s in Apple Music)
const LOOP_PAUSE_MS     = 1000;  // pause after each full loop before restarting
const PIXELS_PER_SECOND = 32;    // comfortable reading pace matching Apple Music
const GAP_PX            = 52;    // silent gap between end of 1st copy & start of 2nd
const FADE_WIDTH        = 14;    // gradient edge width in px — matches Apple Music

// Gradient mask applied as CSS mask-image (web only).
const FADE_MASK = `linear-gradient(to right, transparent 0%, #000 ${FADE_WIDTH}px, #000 calc(100% - ${FADE_WIDTH}px), transparent 100%)`;

type Props = {
  children: string;
  style?: TextStyle | TextStyle[];
};

export function MarqueeText({ children, style }: Props) {
  const [containerW, setContainerW] = useState(0);
  const [naturalW, setNaturalW]     = useState(0);
  const translateX = useRef(new Animated.Value(0)).current;
  const animRef    = useRef<Animated.CompositeAnimation | null>(null);
  // measurerRef is used by onLayout on native only; unused on web.
  const measurerRef = useRef<any>(null);

  const overflows = containerW > 0 && naturalW > containerW;

  // ── Web text measurement ──────────────────────────────────────────────────
  // React Native's StyleSheet normalizer strips non-standard CSS values like
  // "max-content", so we cannot set width via the style prop.  Instead we
  // temporarily mutate the DOM node's inline style directly:
  //   1. Save the current computed width.
  //   2. Set width = max-content → forces the element to its natural text size.
  //   3. Read getBoundingClientRect().width — this is the true text width.
  //   4. Restore the original width so layout is not permanently affected.
  // This runs in useLayoutEffect (synchronous after DOM paint) so there is no
  // visible flash.
  useLayoutEffect(() => {
    if (Platform.OS !== "web") return;
    // Create a raw <span> at the document body level — completely outside React
    // Native's layout system, so there is no containing-block width constraint.
    // position:fixed + top/left off-screen + white-space:nowrap guarantees the
    // span renders at its natural single-line width.
    const span = document.createElement("span");
    span.style.cssText =
      "position:fixed;top:-9999px;left:-9999px;white-space:nowrap;" +
      "visibility:hidden;pointer-events:none;";
    // Mirror the font properties from the style prop so the measurement matches
    // the rendered text exactly.
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

  // ── Animation ──────────────────────────────────────────────────────────────
  const startAnim = useCallback(() => {
    animRef.current?.stop();
    animRef.current = null;
    translateX.setValue(0);
    if (!overflows) return;

    const travel         = naturalW + GAP_PX;
    const scrollDuration = (travel / PIXELS_PER_SECOND) * 1000;

    animRef.current = Animated.loop(
      Animated.sequence([
        Animated.delay(INITIAL_DELAY_MS),
        Animated.timing(translateX, {
          toValue:         -travel,
          duration:        scrollDuration,
          easing:          Easing.linear,
          useNativeDriver: true,
        }),
        Animated.delay(LOOP_PAUSE_MS),
        // Instant reset — second copy is now exactly where first was → seamless.
        Animated.timing(translateX, {
          toValue:         0,
          duration:        0,
          useNativeDriver: true,
        }),
      ]),
    );
    animRef.current.start();
  }, [overflows, naturalW, translateX]);

  useEffect(() => {
    startAnim();
    return () => {
      animRef.current?.stop();
      animRef.current = null;
    };
  }, [startAnim]);

  // Reset & remeasure whenever the text content changes.
  useEffect(() => {
    animRef.current?.stop();
    animRef.current = null;
    translateX.setValue(0);
    // On native, reset naturalW so onLayout fires a fresh measurement.
    // On web, the useLayoutEffect span-measurement already re-runs when
    // children changes — resetting here would overwrite that measurement
    // (useLayoutEffect runs before useEffect, so the reset would undo it).
    if (Platform.OS !== "web") {
      setNaturalW(0);
    }
  }, [children, translateX]);

  // ── Gradient edge fade (web only) ─────────────────────────────────────────
  const clipStyle =
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
      {/* ── Invisible measurer (native only) ────────────────────────────────
           On native: onLayout fires at the text's natural width with no CSS
           constraints, so we can rely on it directly.
           On web: naturalW is set by the useLayoutEffect span technique above;
           the measurer Text is still rendered so the ref is valid, but its
           onLayout is not wired up on web (it would report the clamped width). */}
      <Text
        ref={measurerRef}
        style={[style, styles.measurer]}
        numberOfLines={1}
        onLayout={
          Platform.OS !== "web"
            ? (e) => setNaturalW(e.nativeEvent.layout.width)
            : undefined
        }
        accessibilityElementsHidden
        importantForAccessibility="no"
      >
        {children}
      </Text>

      {/* ── Clipping container with optional gradient mask ── */}
      <View style={clipStyle as any}>
        {overflows ? (
          <Animated.View
            style={[styles.row, { transform: [{ translateX }] }]}
          >
            {/* First copy.
                flexShrink:0 prevents CSS flex-shrink from truncating the text.
                numberOfLines={1} prevents line-wrapping (adds white-space:nowrap).
                Together they guarantee the text renders at exactly naturalW px
                with no ellipsis and no wrapping — the clip View handles visual
                clipping via overflow:hidden. */}
            <Text style={[style, { flexShrink: 0 }]} numberOfLines={1}>
              {children}
            </Text>
            {/* Second copy — GAP_PX silent space before it so the seamless
                reset from -travel → 0 is indistinguishable from normal scroll */}
            <Text style={[style, { paddingLeft: GAP_PX, flexShrink: 0 }]} numberOfLines={1}>
              {children}
            </Text>
          </Animated.View>
        ) : (
          <Text style={style} numberOfLines={1}>
            {children}
          </Text>
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
  measurer: {
    position:      "absolute",
    opacity:       0,
    top:           0,
    left:          0,
    pointerEvents: "none",
  },
  clip: {
    overflow: "hidden",
    flex:     1,
  },
  row: {
    flexDirection: "row",
    // Prevent default align-self:stretch from constraining the row to
    // containerW. With flex-start the row is exactly (2*naturalW + GAP_PX)
    // wide — the full two-copy track needed for the seamless loop.
    alignSelf:     "flex-start",
  },
});
