import { SymbolIcon } from "@/components/SymbolIcon";
import { useQFAllTranslations } from "@/lib/useQFAllTranslations";
import type { QFTranslationOption } from "@/lib/quranFoundationApi";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface Props {
  open: boolean;
  currentId: number;
  onSelect: (id: number) => void;
  onClose: () => void;
}

interface Section {
  language: string;
  data: QFTranslationOption[];
}

export function TranslationPicker({ open, currentId, onSelect, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { translations, loading } = useQFAllTranslations();
  const [query, setQuery] = useState("");

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

    // Group by language, English first, rest alphabetical
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
      onClose();
    },
    [onSelect, onClose],
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
          accessibilityLabel={item.name}
        >
          <View style={styles.rowText}>
            <Text style={[styles.rowLabel, selected && styles.rowLabelSelected]}>
              {item.name}
            </Text>
            {item.authorName !== item.name && (
              <Text style={styles.rowSub}>{item.authorName}</Text>
            )}
          </View>
          {selected && (
            <SymbolIcon
              name="checkmark"
              fallbackIonicon="checkmark"
              size={17}
              color="#e8c078"
              weight="semibold"
            />
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

  return (
    <Modal
      visible={open}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { paddingTop: insets.top || 16 }]}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Translation</Text>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={12}
            activeOpacity={0.7}
            style={styles.closeBtn}
            accessibilityLabel="Close"
          >
            <SymbolIcon name="xmark" fallbackIonicon="close" size={18} color="#a3a3a3" weight="semibold" />
          </TouchableOpacity>
        </View>

        {/* Search */}
        <View style={styles.searchWrap}>
          <SymbolIcon name="magnifyingglass" fallbackIonicon="search" size={16} color="#8e8e93" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search translations…"
            placeholderTextColor="#636366"
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
            clearButtonMode="while-editing"
            returnKeyType="search"
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
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 32 }}
            stickySectionHeadersEnabled={false}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <Text style={styles.emptyText}>No translations match "{query}"</Text>
            }
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#141414",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
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
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginVertical: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: "#f5f5f5",
  },
  sectionHeader: {
    paddingTop: 22,
    paddingBottom: 8,
  },
  sectionHeaderText: {
    fontSize: 13,
    fontWeight: "400",
    color: "#8e8e93",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 13,
    paddingHorizontal: 4,
    minHeight: 50,
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
    fontWeight: "400",
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
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
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
