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

// Upper bound for measurer container on native. Any realistic reciter name
// fits in 2000 px at our font size, so onLayout will always report the true
// natural text width rather than the parent's clamped width.
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
  // React Native's StyleSheet normalizer strips non-standard CSS values like
  // "max-content", so we cannot set width via the style prop.  Instead we
  // temporarily append an off-screen <span> to measure the natural text width.
  // This runs in useLayoutEffect (synchronous after DOM paint) so there is no
  // visible flash.
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
        // Use the `delay` option on Animated.timing instead of Animated.delay().
        // Animated.delay() internally uses useNativeDriver:false which breaks
        // native-driver animation sequences on iOS/Android.
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
    // On native, reset naturalW so the measurer's onLayout fires fresh.
    // On web, useLayoutEffect re-runs from the children dep above and sets
    // naturalW before this useEffect fires — don't overwrite it.
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
      {/* ── Invisible measurer ──────────────────────────────────────────────
           Web: naturalW is set by the useLayoutEffect span above; this node
           is still rendered for ref validity but its onLayout is not wired.

           Native: we wrap the Text in a very wide absolutely-positioned
           container (MEASURER_MAX_W) so the Text is never constrained to the
           parent's flex width. onLayout then fires with the true natural
           single-line width instead of the (smaller) container width. */}
      <View
        style={styles.measurerWrap}
        pointerEvents="none"
        accessible={false}
      >
        <Text
          style={[style, styles.measurerText]}
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
      </View>

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
                with no ellipsis and no wrapping. */}
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
  measurerWrap: {
    // Absolutely positioned so it doesn't affect layout.
    // Wide enough that any realistic reciter name renders at its natural
    // single-line width — onLayout then reports that true width.
    position: "absolute",
    top:      0,
    left:     0,
    width:    MEASURER_MAX_W,
    opacity:  0,
    overflow: "hidden",
  },
  measurerText: {
    // No extra constraints — inherits font style from prop.
    // The wide measurerWrap guarantees no clamping.
  },
  clip: {
    overflow:       "hidden",
    flex:           1,
    // Extra vertical padding so text descenders and textShadow (radius 4, offset
    // y+1) are never clipped by the overflow:hidden boundary.
    paddingVertical: 4,
  },
  row: {
    flexDirection: "row",
    // Prevent default align-self:stretch from constraining the row to
    // containerW. With flex-start the row is exactly (2*naturalW + GAP_PX)
    // wide — the full two-copy track needed for the seamless loop.
    alignSelf:     "flex-start",
  },
});
