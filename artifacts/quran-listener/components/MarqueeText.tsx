import {
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

// ── Timing constants ─────────────────────────────────────────────────────────
const START_DELAY_MS    = 1500;
const END_DELAY_MS      = 1000;
const PIXELS_PER_SECOND = 40;
const FADE_WIDTH        = 18;

// Web CSS mask — true transparency regardless of background colour
const FADE_MASK = `linear-gradient(to right, transparent 0%, black ${FADE_WIDTH}px, black calc(100% - ${FADE_WIDTH}px), transparent 100%)`;

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

  const overflow = containerW > 0 && naturalW > containerW;
  const travel   = overflow ? naturalW - containerW + FADE_WIDTH : 0;

  // ── Web measurement ───────────────────────────────────────────────────────
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

  // ── Reset on text change (native) ─────────────────────────────────────────
  useEffect(() => {
    if (Platform.OS === "web") return;
    animRef.current?.stop();
    animRef.current = null;
    translateX.setValue(0);
    setNaturalW(0);
  }, [children, translateX]);

  // ── Ping-pong animation ───────────────────────────────────────────────────
  // Scrolls to the end with ease-in-out, pauses, reverses back, pauses, repeats.
  useEffect(() => {
    if (!overflow || travel <= 0) {
      animRef.current?.stop();
      animRef.current = null;
      translateX.setValue(0);
      return;
    }

    const duration = (travel / PIXELS_PER_SECOND) * 1000;
    const easing   = Easing.inOut(Easing.ease);

    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(START_DELAY_MS),
        Animated.timing(translateX, {
          toValue: -travel, duration, easing, useNativeDriver: true,
        }),
        Animated.delay(END_DELAY_MS),
        Animated.timing(translateX, {
          toValue: 0, duration, easing, useNativeDriver: true,
        }),
        Animated.delay(END_DELAY_MS),
      ]),
    );

    animRef.current = anim;
    anim.start();
    return () => anim.stop();
  }, [overflow, travel, translateX]);

  // ── Shared invisible measurer ─────────────────────────────────────────────
  const measurer = (
    <View style={styles.measurerWrap} pointerEvents="none" accessible={false}>
      <Text
        style={[style, styles.text]}
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
  );

  const scrollingText = (
    <Animated.View style={[styles.scrollRow, { transform: [{ translateX }] }]}>
      <Text style={[style, styles.text]} numberOfLines={1} ellipsizeMode="clip">
        {children}
      </Text>
    </Animated.View>
  );

  if (!overflow) {
    return (
      <View style={styles.root} onLayout={(e) => setContainerW(e.nativeEvent.layout.width)}>
        {measurer}
        <Text style={[style, styles.text]} numberOfLines={1}>{children}</Text>
      </View>
    );
  }

  // ── Web: CSS mask for true transparency ───────────────────────────────────
  if (Platform.OS === "web") {
    return (
      <View style={styles.root} onLayout={(e) => setContainerW(e.nativeEvent.layout.width)}>
        {measurer}
        <View
          style={[styles.clip, { maskImage: FADE_MASK, WebkitMaskImage: FADE_MASK } as object]}
        >
          {scrollingText}
        </View>
      </View>
    );
  }

  // ── Native: clean overflow:hidden clip ────────────────────────────────────
  // MaskedView requires a native build (incompatible with Expo Go) so we
  // just hard-clip. Looks cleaner than a gradient that fades to the wrong colour.
  return (
    <View style={styles.root} onLayout={(e) => setContainerW(e.nativeEvent.layout.width)}>
      {measurer}
      <View style={styles.clip}>
        {scrollingText}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex:     1,
    minWidth: 0,
  },
  measurerWrap: {
    position:   "absolute",
    top:        0,
    left:       0,
    width:      MEASURER_MAX_W,
    opacity:    0,
    overflow:   "hidden",
    alignItems: "flex-start",
  },
  clip: {
    overflow: "hidden",
  },
  scrollRow: {
    flexDirection: "row",
    alignSelf: "flex-start",
  },
  text: {
    flexShrink: 0,
  },
});
