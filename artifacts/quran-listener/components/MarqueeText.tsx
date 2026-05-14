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

// ── Timing ────────────────────────────────────────────────────────────────────
const START_DELAY_MS    = 1500;
const END_DELAY_MS      = 1000;
const PIXELS_PER_SECOND = 40;
const FADE_WIDTH        = 16;

const FADE_MASK = `linear-gradient(to right, transparent 0%, black ${FADE_WIDTH}px, black calc(100% - ${FADE_WIDTH}px), transparent 100%)`;

type Props = {
  children: string;
  style?: TextStyle | TextStyle[];
};

export function MarqueeText({ children, style }: Props) {
  const [containerW, setContainerW] = useState(0);
  const [textW, setTextW]           = useState(0);
  const translateX = useRef(new Animated.Value(0)).current;
  const animRef    = useRef<Animated.CompositeAnimation | null>(null);

  // How far the text needs to travel so its trailing edge is fully visible.
  const travel = Math.max(0, textW - containerW);
  const shouldScroll = containerW > 0 && travel > 1;

  // ── Web: measure text width via off-screen span ───────────────────────────
  useLayoutEffect(() => {
    if (Platform.OS !== "web") return;
    const span = document.createElement("span");
    span.style.cssText =
      "position:fixed;top:-9999px;left:-9999px;white-space:nowrap;visibility:hidden;pointer-events:none;";
    const flat = StyleSheet.flatten(style) ?? {};
    if (flat.fontSize)      span.style.fontSize     = `${flat.fontSize}px`;
    if (flat.fontWeight)    span.style.fontWeight    = String(flat.fontWeight);
    if (flat.fontFamily)    span.style.fontFamily    = String(flat.fontFamily);
    if (flat.letterSpacing) span.style.letterSpacing = `${flat.letterSpacing}px`;
    span.textContent = children;
    document.body.appendChild(span);
    setTextW(span.getBoundingClientRect().width);
    document.body.removeChild(span);
  }, [children, style]);

  // ── Reset position when text changes ─────────────────────────────────────
  useEffect(() => {
    animRef.current?.stop();
    animRef.current = null;
    translateX.setValue(0);
    if (Platform.OS === "web") return;
    setTextW(0);
  }, [children, translateX]);

  // ── Ping-pong animation ───────────────────────────────────────────────────
  useEffect(() => {
    if (!shouldScroll) {
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
        Animated.timing(translateX, { toValue: -travel, duration, easing, useNativeDriver: true }),
        Animated.delay(END_DELAY_MS),
        Animated.timing(translateX, { toValue: 0, duration, easing, useNativeDriver: true }),
        Animated.delay(END_DELAY_MS),
      ]),
    );

    animRef.current = anim;
    anim.start();
    return () => anim.stop();
  }, [shouldScroll, travel, translateX]);

  // ── Render ────────────────────────────────────────────────────────────────
  // Always render through a single clip container — no conditional path swap.
  // The clip container measures containerW. The Animated.View is sized to textW
  // so React Native never truncates the Text regardless of parent constraints.
  const inner = (
    <Animated.View
      style={{
        width: textW || undefined,
        transform: [{ translateX }],
      }}
    >
      <Text
        style={style}
        numberOfLines={1}
        onTextLayout={
          Platform.OS !== "web"
            ? (e) => {
                const w = e.nativeEvent.lines[0]?.width ?? 0;
                if (w > 0) setTextW(Math.ceil(w));
              }
            : undefined
        }
      >
        {children}
      </Text>
    </Animated.View>
  );

  if (Platform.OS === "web") {
    return (
      <View
        style={styles.root}
        onLayout={(e) => setContainerW(e.nativeEvent.layout.width)}
      >
        <View
          style={[
            styles.clip,
            shouldScroll && ({
              maskImage: FADE_MASK,
              WebkitMaskImage: FADE_MASK,
            } as object),
          ]}
        >
          {inner}
        </View>
      </View>
    );
  }

  return (
    <View
      style={styles.root}
      onLayout={(e) => setContainerW(e.nativeEvent.layout.width)}
    >
      <View style={styles.clip}>
        {inner}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex:     1,
    minWidth: 0,
  },
  clip: {
    overflow: "hidden",
  },
});
