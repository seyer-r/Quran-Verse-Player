import { SymbolIcon } from "@/components/SymbolIcon";
import { useQFAllTranslations } from "@/lib/useQFAllTranslations";
import type { QFTranslationOption } from "@/lib/quranFoundationApi";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";

interface Props {
  open: boolean;
  currentId: number;
  onSelect: (id: number) => void;
  onBack: () => void;
}

interface Section {
  language: string;
  data: QFTranslationOption[];
}

const ANIM_MS = 280;

/**
 * Rendered *inside* SettingsPanel's Modal as an absolutely-positioned
 * slide-in sub-screen — avoids nested Modal crashes on all platforms.
 */
export function TranslationPicker({ open, currentId, onSelect, onBack }: Props) {
  const { width } = useWindowDimensions();
  const { translations, loading } = useQFAllTranslations();
  const [query, setQuery] = useState("");
  const [mounted, setMounted] = useState(open);
  const slideX = useRef(new Animated.Value(open ? 0 : width)).current;

  useEffect(() => {
    if (open) {
      setMounted(true);
      Animated.timing(slideX, {
        toValue: 0,
        duration: ANIM_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else if (mounted) {
      Animated.timing(slideX, {
        toValue: width,
        duration: ANIM_MS,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          setMounted(false);
          setQuery("");
        }
      });
    }
  }, [open, mounted, slideX, width]);

  const sections: Section[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? translations.filter(
          (t) =>
            t.name.toLowerCase().includes(q) ||
            t.authorName.toLowerCase().includes(q) ||
            t.language.toLowerCase().includes(q),
        )
      : translations;

    const map = new Map<string, QFTranslationOption[]>();
    for (const t of filtered) {
      const lang = t.language;
      if (!map.has(lang)) map.set(lang, []);
      map.get(lang)!.push(t);
    }

    const english = map.get("English") ?? [];
    map.delete("English");
    const others = [...map.entries()].sort(([a], [b]) => a.localeCompare(b));

    const result: Section[] = [];
    if (english.length) result.push({ language: "English", data: english });
    for (const [lang, data] of others) result.push({ language: lang, data });
    return result;
  }, [translations, query]);

  const handleSelect = useCallback(
    (id: number) => {
      onSelect(id);
      onBack();
    },
    [onSelect, onBack],
  );

  const renderItem = useCallback(
    ({ item, index, section }: { item: QFTranslationOption; index: number; section: Section }) => {
      const selected = item.id === currentId;
      const isLast = index === section.data.length - 1;
      return (
        <TouchableOpacity
          activeOpacity={0.6}
          onPress={() => handleSelect(item.id)}
          style={[styles.row, !isLast && styles.rowDivider]}
          accessibilityRole="radio"
          accessibilityState={{ selected }}
        >
          <View style={styles.rowText}>
            <Text style={[styles.rowLabel, selected && styles.rowLabelSelected]}>
              {item.name}
            </Text>
            {item.authorName && item.authorName !== item.name && (
              <Text style={styles.rowSub}>{item.authorName}</Text>
            )}
          </View>
          {selected && (
            <SymbolIcon name="checkmark" fallbackIonicon="checkmark" size={17} color="#e8c078" weight="semibold" />
          )}
        </TouchableOpacity>
      );
    },
    [currentId, handleSelect],
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: Section }) => (
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionHeaderText}>{section.language}</Text>
      </View>
    ),
    [],
  );

  const keyExtractor = useCallback((item: QFTranslationOption) => String(item.id), []);

  if (!mounted) return null;

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.container, { transform: [{ translateX: slideX }] }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} hitSlop={12} activeOpacity={0.7} style={styles.backBtn}>
          <SymbolIcon name="chevron.left" fallbackIonicon="chevron-back" size={18} color="#a3a3a3" weight="semibold" />
          <Text style={styles.backLabel}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Translation</Text>
        <View style={styles.backBtn} pointerEvents="none" />
      </View>

      {/* Search bar */}
      <View style={styles.searchWrap}>
        <SymbolIcon name="magnifyingglass" fallbackIonicon="search" size={15} color="#8e8e93" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search translations…"
          placeholderTextColor="#636366"
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          returnKeyType="search"
          keyboardAppearance="dark"
        />
        {query.length > 0 && (
          <Pressable onPress={() => setQuery("")} hitSlop={8}>
            <SymbolIcon name="xmark.circle.fill" fallbackIonicon="close-circle" size={16} color="#636366" />
          </Pressable>
        )}
      </View>

      {/* List */}
      {loading && translations.length === 0 ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color="#e8c078" />
          <Text style={styles.loadingText}>Loading translations…</Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          contentContainerStyle={styles.listContent}
          stickySectionHeadersEnabled={false}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <Text style={styles.emptyText}>No results for "{query}"</Text>
          }
        />
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#1c1c1e",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#f5f5f5",
    letterSpacing: -0.2,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    width: 72,
    paddingVertical: 4,
  },
  backLabel: {
    fontSize: 17,
    color: "#a3a3a3",
    marginLeft: 2,
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginVertical: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: "#f5f5f5",
    marginLeft: 6,
  },
  sectionHeader: {
    paddingTop: 20,
    paddingBottom: 6,
    paddingHorizontal: 4,
  },
  sectionHeaderText: {
    fontSize: 13,
    color: "#8e8e93",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 4,
    minHeight: 48,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.07)",
  },
  rowText: {
    flex: 1,
    paddingRight: 12,
  },
  rowLabel: {
    fontSize: 16,
    color: "#d4d4d4",
  },
  rowLabelSelected: {
    color: "#f5f5f5",
    fontWeight: "500",
  },
  rowSub: {
    marginTop: 2,
    fontSize: 13,
    color: "#636366",
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    rowGap: 12,
  },
  loadingText: {
    fontSize: 15,
    color: "#636366",
  },
  emptyText: {
    paddingTop: 40,
    textAlign: "center",
    fontSize: 15,
    color: "#636366",
  },
});
