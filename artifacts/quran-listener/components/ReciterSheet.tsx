import { SymbolIcon } from "@/components/SymbolIcon";
import { RECITERS, type ReciterId } from "@/data/reciters";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface ReciterSheetProps {
  open: boolean;
  onClose: () => void;
  reciterId: ReciterId;
  onReciterChange: (id: ReciterId) => void;
}

const ANIM_MS = 280;

export function ReciterSheet({
  open,
  onClose,
  reciterId,
  onReciterChange,
}: ReciterSheetProps) {
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(open);
  const slide = useRef(new Animated.Value(400)).current;
  const fade = useRef(new Animated.Value(0)).current;

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (open) {
      setMounted(true);
      Animated.parallel([
        Animated.timing(slide, {
          toValue: 0,
          duration: ANIM_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(fade, {
          toValue: 1,
          duration: ANIM_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    } else if (mounted) {
      Animated.parallel([
        Animated.timing(slide, {
          toValue: 400,
          duration: ANIM_MS,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(fade, {
          toValue: 0,
          duration: ANIM_MS,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [open, mounted, slide, fade]);

  const bottomInset =
    Platform.OS === "web" ? Math.max(insets.bottom, 20) : insets.bottom;

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={StyleSheet.absoluteFill}>
        <Animated.View
          style={[StyleSheet.absoluteFill, { opacity: fade }]}
          pointerEvents={open ? "auto" : "none"}
        >
          <Pressable
            style={[StyleSheet.absoluteFill, styles.backdrop]}
            onPress={onClose}
            accessibilityLabel="Close reciter picker"
          />
        </Animated.View>

        <Animated.View
          style={[
            styles.sheet,
            {
              paddingBottom: bottomInset + 16,
              transform: [{ translateY: slide }],
            },
          ]}
          accessibilityViewIsModal
          accessibilityLabel="Choose reciter"
        >
          <View style={styles.handleWrap}>
            <View style={styles.handle} />
          </View>

          <View style={styles.header}>
            <Text style={styles.title}>Reciter</Text>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={12}
              style={styles.closeBtn}
              activeOpacity={0.7}
              accessibilityLabel="Close"
            >
              <SymbolIcon
                name="xmark"
                fallbackIonicon="close"
                size={16}
                color="#a3a3a3"
                weight="semibold"
              />
            </TouchableOpacity>
          </View>

          <View style={styles.group}>
            {RECITERS.map((r, i) => {
              const selected = r.id === reciterId;
              const isLast = i === RECITERS.length - 1;
              return (
                <TouchableOpacity
                  key={r.id}
                  onPress={() => {
                    onReciterChange(r.id);
                    onClose();
                  }}
                  activeOpacity={0.6}
                  style={[styles.row, !isLast && styles.rowDivider]}
                  accessibilityLabel={r.name}
                  accessibilityState={{ selected }}
                >
                  <View style={styles.rowIcon}>
                    <SymbolIcon
                      name="mic.fill"
                      fallbackIonicon="mic"
                      size={18}
                      color={selected ? "#f5f5f5" : "#737373"}
                    />
                  </View>
                  <Text
                    style={[
                      styles.rowLabel,
                      selected && styles.rowLabelSelected,
                    ]}
                  >
                    {r.name}
                  </Text>
                  <View style={styles.rowAccessory}>
                    {selected && (
                      <SymbolIcon
                        name="checkmark"
                        fallbackIonicon="checkmark"
                        size={17}
                        color="#e8c078"
                        weight="semibold"
                      />
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#1c1c1e",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: -8 },
    elevation: 32,
    paddingHorizontal: 20,
  },
  handleWrap: {
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 6,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 4,
    paddingBottom: 16,
  },
  title: {
    fontSize: 17,
    color: "#f5f5f5",
    fontWeight: "600",
    letterSpacing: -0.2,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  group: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 14,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 50,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.07)",
  },
  rowIcon: {
    width: 30,
    alignItems: "center",
    marginRight: 8,
  },
  rowLabel: {
    flex: 1,
    fontSize: 17,
    color: "#d4d4d4",
    fontWeight: "400",
  },
  rowLabelSelected: {
    color: "#f5f5f5",
    fontWeight: "500",
  },
  rowAccessory: {
    minWidth: 22,
    alignItems: "flex-end",
  },
});
