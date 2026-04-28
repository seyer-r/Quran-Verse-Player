import { Feather } from "@expo/vector-icons";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { surahs, type Surah } from "@/data/quran";

interface SurahPickerProps {
  open: boolean;
  onClose: () => void;
  currentSurah: number;
  currentAyah: number; // 1-based within currentSurah
  onSelect: (surahNumber: number, ayahNumber: number) => void;
}

const ANIM_MS = 240;

export function SurahPicker({
  open,
  onClose,
  currentSurah,
  currentAyah,
  onSelect,
}: SurahPickerProps) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();

  const [mounted, setMounted] = useState(open);
  const [query, setQuery] = useState("");
  // Which surah's ayah grid is expanded inside the picker.
  const [expandedSurah, setExpandedSurah] = useState<number>(currentSurah);

  const slide = useRef(new Animated.Value(height)).current;
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (open) {
      setMounted(true);
      setQuery("");
      setExpandedSurah(currentSurah);
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
          toValue: height,
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
  }, [open, height, slide, fade, mounted, currentSurah]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return surahs;
    // Match by number, latin name (with/without dashes), or meaning.
    return surahs.filter((s) => {
      if (String(s.number) === q) return true;
      const latin = s.nameLatin.toLowerCase();
      if (latin.includes(q)) return true;
      if (latin.replace(/[^a-z]/g, "").includes(q.replace(/[^a-z]/g, ""))) return true;
      if (s.meaning.toLowerCase().includes(q)) return true;
      return false;
    });
  }, [query]);

  const topInset = Platform.OS === "web" ? Math.max(insets.top, 24) : insets.top;
  const bottomInset =
    Platform.OS === "web" ? Math.max(insets.bottom, 24) : insets.bottom;

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
            accessibilityLabel="Close surah picker"
          />
        </Animated.View>

        <Animated.View
          style={[
            styles.sheet,
            {
              paddingTop: topInset + 14,
              transform: [{ translateY: slide }],
            },
          ]}
          accessibilityViewIsModal
          accessibilityLabel="Choose surah"
        >
          <View style={styles.handleBar} />
          <View style={styles.headerRow}>
            <Text style={styles.headerTitle}>Surah</Text>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={12}
              style={styles.closeBtn}
              accessibilityLabel="Close"
              activeOpacity={0.7}
            >
              <Feather name="x" size={20} color="#a3a3a3" />
            </TouchableOpacity>
          </View>

          <View style={styles.searchWrap}>
            <Feather
              name="search"
              size={16}
              color="#737373"
              style={styles.searchIcon}
            />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search by name or number"
              placeholderTextColor="#525252"
              style={styles.searchInput}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
              accessibilityLabel="Search surah"
            />
            {query.length > 0 && (
              <TouchableOpacity
                onPress={() => setQuery("")}
                hitSlop={8}
                style={styles.searchClear}
              >
                <Feather name="x-circle" size={16} color="#737373" />
              </TouchableOpacity>
            )}
          </View>

          <FlatList
            data={filtered}
            keyExtractor={(s) => String(s.number)}
            keyboardShouldPersistTaps="handled"
            initialNumToRender={20}
            windowSize={11}
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingBottom: bottomInset + 24,
            }}
            ListEmptyComponent={
              <Text style={styles.emptyText}>No surah matches "{query}"</Text>
            }
            renderItem={({ item }) => (
              <SurahRow
                surah={item}
                isCurrent={item.number === currentSurah}
                expanded={expandedSurah === item.number}
                currentAyah={item.number === currentSurah ? currentAyah : 0}
                onPress={() => {
                  if (expandedSurah === item.number) {
                    // Tapping the same surah collapses (so user can re-pick).
                    // But primarily this acts as "select surah from ayah 1".
                    onSelect(item.number, 1);
                  } else {
                    setExpandedSurah(item.number);
                  }
                }}
                onPickAyah={(ayah) => onSelect(item.number, ayah)}
                onJumpToFirst={() => onSelect(item.number, 1)}
              />
            )}
          />
        </Animated.View>
      </View>
    </Modal>
  );
}

interface SurahRowProps {
  surah: Surah;
  isCurrent: boolean;
  expanded: boolean;
  currentAyah: number;
  onPress: () => void;
  onPickAyah: (ayahNumber: number) => void;
  onJumpToFirst: () => void;
}

function SurahRow({
  surah,
  isCurrent,
  expanded,
  currentAyah,
  onPress,
  onPickAyah,
  onJumpToFirst,
}: SurahRowProps) {
  const ayahNumbers = useMemo(
    () => Array.from({ length: surah.ayahCount }, (_, i) => i + 1),
    [surah.ayahCount],
  );

  return (
    <View style={[styles.row, isCurrent && styles.rowCurrent]}>
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.7}
        style={styles.rowHeader}
        accessibilityLabel={`Surah ${surah.number}, ${surah.nameLatin}, ${surah.ayahCount} ayahs`}
      >
        <View style={styles.numberBadge}>
          <Text style={styles.numberBadgeText}>{surah.number}</Text>
        </View>
        <View style={styles.rowText}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {surah.nameLatin}
            {isCurrent && <Text style={styles.rowCurrentDot}> •</Text>}
          </Text>
          <Text style={styles.rowSubtitle} numberOfLines={1}>
            {surah.meaning} · {surah.ayahCount} ayahs · {surah.revelationType}
          </Text>
        </View>
        <Text style={styles.rowArabic} allowFontScaling={false}>
          {surah.nameArabic}
        </Text>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.ayahPanel}>
          <View style={styles.ayahPanelHeader}>
            <Text style={styles.ayahPanelLabel}>Jump to ayah</Text>
            <TouchableOpacity
              onPress={onJumpToFirst}
              hitSlop={8}
              activeOpacity={0.7}
            >
              <Text style={styles.ayahPanelStart}>From start →</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.ayahGrid}>
            {ayahNumbers.map((n) => {
              const active = isCurrent && n === currentAyah;
              return (
                <TouchableOpacity
                  key={n}
                  onPress={() => onPickAyah(n)}
                  activeOpacity={0.7}
                  style={[styles.ayahChip, active && styles.ayahChipActive]}
                  accessibilityLabel={`Ayah ${n}`}
                >
                  <Text
                    style={[
                      styles.ayahChipText,
                      active && styles.ayahChipTextActive,
                    ]}
                  >
                    {n}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "#0a0a0a",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    overflow: "hidden",
  },
  handleBar: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.18)",
    marginTop: -6,
    marginBottom: 10,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  headerTitle: {
    fontSize: 22,
    color: "#f5f5f5",
    fontWeight: "600",
    letterSpacing: -0.4,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  searchWrap: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    color: "#f5f5f5",
    fontSize: 15,
  },
  searchClear: {
    marginLeft: 8,
    padding: 4,
  },
  emptyText: {
    color: "#737373",
    textAlign: "center",
    paddingVertical: 32,
    fontSize: 14,
  },
  row: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 14,
    marginBottom: 8,
    overflow: "hidden",
  },
  rowCurrent: {
    borderWidth: 1,
    borderColor: "rgba(232,192,120,0.5)",
  },
  rowHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 12,
  },
  numberBadge: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  numberBadgeText: {
    color: "#d4d4d4",
    fontSize: 13,
    fontWeight: "600",
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    color: "#f5f5f5",
    fontSize: 15,
    fontWeight: "500",
  },
  rowCurrentDot: {
    color: "#e8c078",
  },
  rowSubtitle: {
    marginTop: 2,
    color: "#737373",
    fontSize: 12,
  },
  rowArabic: {
    color: "#f5f5f5",
    fontFamily: "UthmanicHafs",
    fontSize: 22,
    includeFontPadding: false,
    textAlign: "right",
    minWidth: 80,
  },
  ayahPanel: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    paddingTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.07)",
  },
  ayahPanelHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 8,
  },
  ayahPanelLabel: {
    fontSize: 11,
    color: "#737373",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    fontWeight: "500",
  },
  ayahPanelStart: {
    fontSize: 12,
    color: "#e8c078",
    fontWeight: "500",
  },
  ayahGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  ayahChip: {
    minWidth: 36,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  ayahChipActive: {
    backgroundColor: "#e8c078",
  },
  ayahChipText: {
    color: "#d4d4d4",
    fontSize: 13,
    fontWeight: "500",
  },
  ayahChipTextActive: {
    color: "#000",
    fontWeight: "600",
  },
});
