import MaskedView from "@react-native-masked-view/masked-view";
import { LinearGradient } from "expo-linear-gradient";
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
const START_DELAY_MS    = 1500; // pause before first scroll
const END_DELAY_MS      = 1000; // pause at each end before reversing
const PIXELS_PER_SECOND = 40;
const FADE_WIDTH        = 18;

// Web CSS mask — true transparency regardless of background
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
  // Matches Apple Music's Now Playing scroll behaviour exactly.
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
        // Initial hold at start
        Animated.delay(START_DELAY_MS),
        // Scroll to end
        Animated.timing(translateX, {
          toValue:         -travel,
          duration,
          easing,
          useNativeDriver: true,
        }),
        // Hold at end
        Animated.delay(END_DELAY_MS),
        // Scroll back to start
        Animated.timing(translateX, {
          toValue:         0,
          duration,
          easing,
          useNativeDriver: true,
        }),
        // Hold at start before next cycle
        Animated.delay(END_DELAY_MS),
      ]),
    );

    animRef.current = anim;
    anim.start();
    return () => anim.stop();
  }, [overflow, travel, translateX]);

  // ── Render ────────────────────────────────────────────────────────────────
  const textNode = (
    <Animated.View style={{ transform: [{ translateX }] }}>
      <Text style={[style, styles.text]} numberOfLines={1}>
        {children}
      </Text>
    </Animated.View>
  );

  if (!overflow) {
    return (
      <View
        style={styles.root}
        onLayout={(e) => setContainerW(e.nativeEvent.layout.width)}
      >
        {/* Invisible measurer */}
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
        <Text style={[style, styles.text]} numberOfLines={1}>
          {children}
        </Text>
      </View>
    );
  }

  // Overflowing — apply fade mask
  if (Platform.OS === "web") {
    return (
      <View
        style={styles.root}
        onLayout={(e) => setContainerW(e.nativeEvent.layout.width)}
      >
        <View style={styles.measurerWrap} pointerEvents="none" accessible={false}>
          <Text style={[style, styles.text]} numberOfLines={1}>
            {children}
          </Text>
        </View>
        <View
          style={[
            styles.clip,
            {
              maskImage:       FADE_MASK,
              WebkitMaskImage: FADE_MASK,
            } as object,
          ]}
        >
          {textNode}
        </View>
      </View>
    );
  }

  // Native — MaskedView for true transparency masking
  return (
    <View
      style={styles.root}
      onLayout={(e) => setContainerW(e.nativeEvent.layout.width)}
    >
      <View style={styles.measurerWrap} pointerEvents="none" accessible={false}>
        <Text
          style={[style, styles.text]}
          numberOfLines={1}
          onTextLayout={(e) => {
            const w = e.nativeEvent.lines[0]?.width ?? 0;
            if (w > 0) setNaturalW(Math.ceil(w));
          }}
          accessibilityElementsHidden
          importantForAccessibility="no"
        >
          {children}
        </Text>
      </View>
      <MaskedView
        style={styles.clip}
        maskElement={
          <LinearGradient
            colors={["transparent", "#000", "#000", "transparent"]}
            locations={[0, FADE_WIDTH / containerW, 1 - FADE_WIDTH / containerW, 1]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        }
      >
        {textNode}
      </MaskedView>
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
  text: {
    flexShrink: 0,
  },
});
