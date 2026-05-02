import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  TextStyle,
  View,
} from "react-native";

const PAUSE_BEFORE_SCROLL_MS = 2200;
const PAUSE_AFTER_LOOP_MS = 800;
const GAP_PX = 48;
const PIXELS_PER_SECOND = 40;

type Props = {
  children: string;
  style?: TextStyle | TextStyle[];
};

export function MarqueeText({ children, style }: Props) {
  const [containerW, setContainerW] = useState(0);
  const [naturalW, setNaturalW] = useState(0);
  const translateX = useRef(new Animated.Value(0)).current;
  const animRef = useRef<Animated.CompositeAnimation | null>(null);

  const overflows = containerW > 0 && naturalW > containerW;

  const startAnim = useCallback(() => {
    if (animRef.current) {
      animRef.current.stop();
      animRef.current = null;
    }
    translateX.setValue(0);
    if (!overflows) return;

    const travel = naturalW + GAP_PX;
    const scrollDuration = (travel / PIXELS_PER_SECOND) * 1000;

    animRef.current = Animated.loop(
      Animated.sequence([
        Animated.delay(PAUSE_BEFORE_SCROLL_MS),
        Animated.timing(translateX, {
          toValue: -travel,
          duration: scrollDuration,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.delay(PAUSE_AFTER_LOOP_MS),
        Animated.timing(translateX, {
          toValue: 0,
          duration: 0,
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

  // Reset + remeasure whenever the text content changes.
  useEffect(() => {
    if (animRef.current) {
      animRef.current.stop();
      animRef.current = null;
    }
    translateX.setValue(0);
    setNaturalW(0);
  }, [children, translateX]);

  return (
    <View
      style={styles.root}
      onLayout={(e) => setContainerW(e.nativeEvent.layout.width)}
    >
      {/* Off-screen measurer — must sit ABOVE the clipped layer so it isn't
          clipped itself. It takes its natural width and reports it. */}
      <Text
        style={[style, styles.measurer]}
        numberOfLines={1}
        onLayout={(e) => setNaturalW(e.nativeEvent.layout.width)}
        accessibilityElementsHidden
        importantForAccessibility="no"
      >
        {children}
      </Text>

      <View style={styles.clip}>
        {overflows ? (
          <Animated.View
            style={[styles.row, { transform: [{ translateX }] }]}
          >
            <Text style={style} numberOfLines={1}>
              {children}
            </Text>
            <Text style={[style, { paddingLeft: GAP_PX }]} numberOfLines={1}>
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
    flex: 1,
    minWidth: 0,
    overflow: "visible",
  },
  measurer: {
    position: "absolute",
    opacity: 0,
    top: 0,
    left: 0,
    pointerEvents: "none",
  },
  clip: {
    overflow: "hidden",
    flex: 1,
  },
  row: {
    flexDirection: "row",
  },
});
