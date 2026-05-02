// Surah / Ayah picker — Apple HIG inspired.
//
// A bottom sheet with two stacked panels that slide horizontally:
//   1. "Surah" — searchable list (no inline ayah grid).
//   2. "Ayah"  — large iOS-style wheel picker + live verse preview +
//                a single primary action.
//
// Why a wheel and not a button grid?
//   - Identical interaction for surahs of 3 ayahs and surahs of 286 ayahs.
//   - One thumb gesture replaces a wall of touch targets.
//   - Native iOS/Android pattern; users know how to drive it.
//   - Visually quiet: a single column of numerals with soft fades top/bottom.
//
// Why a separate Ayah panel and not inline expansion?
//   - Drilling in lets the panel breathe — surah identity, verse preview, and
//     the wheel each get their own visual zone.
//   - Mirrors Apple's master/detail navigation in Settings, Books, Music.
//   - Keeps the surah list scannable.

import { SymbolIcon } from "@/components/SymbolIcon";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  FlatList,
  Modal,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  PanResponder,
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

import {
  ayahMarker,
  getSurah,
  surahs,
  type Ayah,
  type Surah,
} from "@/data/quran";

interface SurahPickerProps {
  open: boolean;
  onClose: () => void;
  currentSurah: number;
  /** 1-based within currentSurah. */
  currentAyah: number;
  onSelect: (surahNumber: number, ayahNumber: number) => void;
  /**
   * Which panel to open first. "surah" lets the user pick a surah and then
   * drill into ayahs. "ayah" jumps straight to the wheel for the current
   * surah — used when the user taps the AYAH counter.
   */
  initialStep?: Step;
}

type Step = "surah" | "ayah";

const SHEET_ANIM_MS = 240;
const STEP_ANIM_MS = 280;
const SWIPE_CLOSE_THRESHOLD = 90;

export function SurahPicker({
  open,
  onClose,
  currentSurah,
  currentAyah,
  onSelect,
  initialStep = "surah",
}: SurahPickerProps) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  const [mounted, setMounted] = useState(open);
  const [step, setStep] = useState<Step>(initialStep);
  const [query, setQuery] = useState("");
  const [draftSurah, setDraftSurah] = useState(currentSurah);
  const [draftAyah, setDraftAyah] = useState(currentAyah);

  // Sheet open/close.
  const slide = useRef(new Animated.Value(height)).current;
  const dragY = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(0)).current;
  // Horizontal panel transition (0 = surah, -width = ayah).
  const stepX = useRef(new Animated.Value(0)).current;

  // Keep onClose stable for the PanResponder closure
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const swipePan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) dragY.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > SWIPE_CLOSE_THRESHOLD || g.vy > 0.8) {
          dragY.setValue(0);
          onCloseRef.current();
        } else {
          Animated.spring(dragY, {
            toValue: 0,
            useNativeDriver: true,
            tension: 180,
            friction: 18,
          }).start();
        }
      },
    }),
  ).current;

  useEffect(() => {
    if (open) {
      dragY.setValue(0);
      setMounted(true);
      setQuery("");
      setStep(initialStep);
      setDraftSurah(currentSurah);
      setDraftAyah(currentAyah);
      stepX.setValue(initialStep === "ayah" ? -width : 0);
      Animated.parallel([
        Animated.timing(slide, {
          toValue: 0,
          duration: SHEET_ANIM_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(fade, {
          toValue: 1,
          duration: SHEET_ANIM_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    } else if (mounted) {
      Animated.parallel([
        Animated.timing(slide, {
          toValue: height,
          duration: SHEET_ANIM_MS,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(fade, {
          toValue: 0,
          duration: SHEET_ANIM_MS,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [open, height, width, slide, dragY, fade, stepX, initialStep, currentSurah, currentAyah, mounted]);

  // Animate horizontal step transitions.
  useEffect(() => {
    Animated.timing(stepX, {
      toValue: step === "surah" ? 0 : -width,
      duration: STEP_ANIM_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [step, width, stepX]);

  const handleSurahTap = (surah: Surah) => {
    setDraftSurah(surah.number);
    // Switching surah resets ayah to 1 (it's a fresh starting point).
    // Tapping the same surah preserves the user's current position.
    setDraftAyah(surah.number === currentSurah ? currentAyah : 1);
    setStep("ayah");
  };

  const handleConfirm = () => {
    onSelect(draftSurah, draftAyah);
  };

  const handleBackToSurahList = () => {
    setStep("surah");
  };

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
            accessibilityLabel="Close picker"
          />
        </Animated.View>

        <Animated.View
          style={[
            styles.sheet,
            {
              paddingTop: topInset + 14,
              transform: [{ translateY: Animated.add(slide, dragY) }],
            },
          ]}
          accessibilityViewIsModal
        >
          <View style={styles.handleBar} {...swipePan.panHandlers} />

          {/* Two horizontally-slid panels, each the full width of the sheet. */}
          <View style={styles.panelsViewport}>
            <Animated.View
              style={[
                styles.panelsRow,
                {
                  width: width * 2,
                  transform: [{ translateX: stepX }],
                },
              ]}
            >
              <View style={[styles.panel, { width }]}>
                <SurahListPanel
                  query={query}
                  onQueryChange={setQuery}
                  currentSurah={currentSurah}
                  onClose={onClose}
                  onSelectSurah={handleSurahTap}
                  bottomInset={bottomInset}
                />
              </View>
              <View style={[styles.panel, { width }]}>
                <AyahWheelPanel
                  surah={getSurah(draftSurah)}
                  draftAyah={draftAyah}
                  onChange={setDraftAyah}
                  onBack={handleBackToSurahList}
                  onClose={onClose}
                  onConfirm={handleConfirm}
                  bottomInset={bottomInset}
                  active={step === "ayah"}
                />
              </View>
            </Animated.View>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Panel 1: Surah list                                                        */
/* ────────────────────────────────────────────────────────────────────────── */

interface SurahListPanelProps {
  query: string;
  onQueryChange: (q: string) => void;
  currentSurah: number;
  onClose: () => void;
  onSelectSurah: (s: Surah) => void;
  bottomInset: number;
}

function SurahListPanel({
  query,
  onQueryChange,
  currentSurah,
  onClose,
  onSelectSurah,
  bottomInset,
}: SurahListPanelProps) {
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return surahs;
    const onlyLetters = q.replace(/[^a-z]/g, "");
    return surahs.filter((s) => {
      if (String(s.number) === q) return true;
      const latin = s.nameLatin.toLowerCase();
      if (latin.includes(q)) return true;
      if (onlyLetters && latin.replace(/[^a-z]/g, "").includes(onlyLetters)) {
        return true;
      }
      if (s.meaning.toLowerCase().includes(q)) return true;
      return false;
    });
  }, [query]);

  // Anchor the initial scroll on the currently-playing surah so the user lands
  // near where they are (no need to scroll through 100+ rows to find it).
  const listRef = useRef<FlatList<Surah>>(null);
  useEffect(() => {
    if (!query) {
      const idx = surahs.findIndex((s) => s.number === currentSurah);
      if (idx > 4) {
        // Defer to next frame — the FlatList isn't laid out on first render.
        requestAnimationFrame(() => {
          try {
            listRef.current?.scrollToIndex({
              index: idx,
              animated: false,
              viewPosition: 0.3,
            });
          } catch {
            // ignore — list may not be ready yet
          }
        });
      }
    }
  }, [currentSurah, query]);

  return (
    <View style={styles.panelInner}>
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>Surah</Text>
        <TouchableOpacity
          onPress={onClose}
          hitSlop={12}
          style={styles.closeBtn}
          accessibilityLabel="Close"
          activeOpacity={0.7}
        >
          <SymbolIcon name="xmark" fallbackIonicon="close" size={18} color="#a3a3a3" weight="semibold" />
        </TouchableOpacity>
      </View>

      <View style={styles.searchRow}>
        <View style={[styles.searchWrap, isFocused && styles.searchWrapFocused]}>
          <SymbolIcon
            name="magnifyingglass"
            fallbackIonicon="search"
            size={16}
            color="#8e8e93"
            style={styles.searchIcon}
          />
          <TextInput
            ref={inputRef}
            value={query}
            onChangeText={onQueryChange}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder="Search"
            placeholderTextColor="#636366"
            style={styles.searchInput}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            accessibilityLabel="Search surah"
          />
          {query.length > 0 && (
            <TouchableOpacity
              onPress={() => onQueryChange("")}
              hitSlop={8}
              style={styles.searchClear}
            >
              <SymbolIcon
                name="xmark.circle.fill"
                fallbackIonicon="close-circle"
                size={16}
                color="#636366"
              />
            </TouchableOpacity>
          )}
        </View>
        {isFocused && (
          <TouchableOpacity
            onPress={() => {
              onQueryChange("");
              inputRef.current?.blur();
            }}
            hitSlop={8}
            style={styles.searchCancel}
            activeOpacity={0.7}
          >
            <Text style={styles.searchCancelText}>Cancel</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        ref={listRef}
        data={filtered}
        keyExtractor={(s) => String(s.number)}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={16}
        windowSize={11}
        getItemLayout={(_, index) => ({
          length: SURAH_ROW_HEIGHT,
          offset: SURAH_ROW_HEIGHT * index,
          index,
        })}
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
            onPress={() => onSelectSurah(item)}
          />
        )}
      />
    </View>
  );
}

const SURAH_ROW_HEIGHT = 64;

interface SurahRowProps {
  surah: Surah;
  isCurrent: boolean;
  onPress: () => void;
}

function SurahRow({ surah, isCurrent, onPress }: SurahRowProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.6}
      style={[styles.surahRow, isCurrent && styles.surahRowCurrent]}
      accessibilityLabel={`Surah ${surah.number}, ${surah.nameLatin}, ${surah.ayahCount} ayahs`}
    >
      <Text
        style={[styles.surahRowNumber, isCurrent && styles.surahRowNumberCurrent]}
      >
        {String(surah.number).padStart(3, " ")}
      </Text>
      <View style={styles.surahRowText}>
        <Text style={styles.surahRowTitle} numberOfLines={1}>
          {surah.nameLatin}
        </Text>
        <Text style={styles.surahRowSubtitle} numberOfLines={1}>
          {surah.meaning} · {surah.ayahCount} ayahs
        </Text>
      </View>
      <Text style={styles.surahRowArabic} allowFontScaling={false}>
        {surah.nameArabic.replace(/^سُورَةُ\s*/, "")}
      </Text>
      <SymbolIcon
        name="chevron.right"
        fallbackIonicon="chevron-forward"
        size={16}
        color="#525252"
        weight="semibold"
        style={styles.surahRowChev}
      />
    </TouchableOpacity>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Panel 2: Ayah wheel                                                        */
/* ────────────────────────────────────────────────────────────────────────── */

interface AyahWheelPanelProps {
  surah: Surah;
  draftAyah: number;
  onChange: (ayahNumber: number) => void;
  onBack: () => void;
  onClose: () => void;
  onConfirm: () => void;
  bottomInset: number;
  /** True when this panel is the visible step — used to sync the wheel position. */
  active: boolean;
}

function AyahWheelPanel({
  surah,
  draftAyah,
  onChange,
  onBack,
  onClose,
  onConfirm,
  bottomInset,
  active,
}: AyahWheelPanelProps) {
  const ayah = surah.ayahs[draftAyah - 1];

  return (
    <View style={styles.panelInner}>
      <View style={styles.headerRow}>
        <TouchableOpacity
          onPress={onBack}
          hitSlop={12}
          style={styles.backBtn}
          accessibilityLabel="Back to surah list"
          activeOpacity={0.7}
        >
          <SymbolIcon name="chevron.left" fallbackIonicon="chevron-back" size={20} color="#d4d4d4" weight="semibold" />
          <Text style={styles.backBtnText}>Surah</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onClose}
          hitSlop={12}
          style={styles.closeBtn}
          accessibilityLabel="Close"
          activeOpacity={0.7}
        >
          <SymbolIcon name="xmark" fallbackIonicon="close" size={18} color="#a3a3a3" weight="semibold" />
        </TouchableOpacity>
      </View>

      <View style={styles.surahCardWrap}>
        <Text style={styles.surahCardEyebrow}>SURAH {surah.number}</Text>
        <Text style={styles.surahCardLatin} numberOfLines={1}>
          {surah.nameLatin}
        </Text>
        <Text style={styles.surahCardArabic} allowFontScaling={false}>
          {surah.nameArabic}
        </Text>
        <Text style={styles.surahCardMeta}>
          {surah.meaning} · {surah.ayahCount} ayahs · {surah.revelationType}
        </Text>
      </View>

      <View style={styles.previewWrap}>
        <Text style={styles.previewLabel}>AYAH {draftAyah}</Text>
        <Text
          style={styles.previewArabic}
          numberOfLines={2}
          ellipsizeMode="tail"
          allowFontScaling={false}
        >
          {ayah.arabic}
          {ayahMarker(ayah.number)}
        </Text>
        <Text
          style={styles.previewTranslation}
          numberOfLines={2}
          ellipsizeMode="tail"
        >
          {ayah.translation}
        </Text>
      </View>

      <WheelPicker
        count={surah.ayahCount}
        value={draftAyah}
        onChange={onChange}
        active={active}
        // Re-anchor the wheel when the user picks a different surah.
        anchorKey={surah.number}
      />

      <View style={[styles.confirmBar, { paddingBottom: bottomInset + 12 }]}>
        <TouchableOpacity
          onPress={onConfirm}
          activeOpacity={0.85}
          style={styles.confirmBtn}
          accessibilityLabel={`Listen from ayah ${draftAyah}`}
        >
          <Text style={styles.confirmBtnText}>
            Listen from ayah {draftAyah}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Wheel picker — iOS UIPickerView vibe, built on FlatList                    */
/* ────────────────────────────────────────────────────────────────────────── */

interface WheelPickerProps {
  count: number;
  value: number; // 1-based
  onChange: (value: number) => void;
  /** Forces a re-anchor (initial scroll) when the underlying data changes. */
  anchorKey: number | string;
  /** True when the panel is visible — controls when to apply initial scroll. */
  active: boolean;
}

const ITEM_HEIGHT = 48;
const VISIBLE_ITEMS = 5;
const PAD_ITEMS = Math.floor(VISIBLE_ITEMS / 2);

function WheelPicker({
  count,
  value,
  onChange,
  anchorKey,
  active,
}: WheelPickerProps) {
  const data = useMemo(
    () => Array.from({ length: count }, (_, i) => i + 1),
    [count],
  );
  const listRef = useRef<FlatList<number>>(null);

  // Drives the per-item opacity / scale interpolation. We use JS-driven
  // animation here on purpose — RN-Web doesn't support `useNativeDriver` for
  // scroll events, and 5 visible items at 48 px is well within JS budget.
  const scrollY = useRef(new Animated.Value((value - 1) * ITEM_HEIGHT)).current;

  // Anchor the scroll position whenever the surah (and therefore `count`)
  // changes, or when the panel becomes active.
  useEffect(() => {
    const offset = Math.max(0, Math.min(count - 1, value - 1)) * ITEM_HEIGHT;
    scrollY.setValue(offset);
    // requestAnimationFrame so the FlatList has measured before we scroll.
    requestAnimationFrame(() => {
      try {
        listRef.current?.scrollToOffset({ offset, animated: false });
      } catch {
        // ignore
      }
    });
    // We intentionally re-run on anchorKey / active so re-opening the panel
    // realigns the wheel to the persisted ayah.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchorKey, active, count]);

  const handleMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    const idx = Math.max(0, Math.min(count - 1, Math.round(y / ITEM_HEIGHT)));
    const next = idx + 1;
    if (next !== value) onChange(next);
  };

  const handleScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
    { useNativeDriver: false },
  );

  return (
    <View style={styles.wheelWrap}>
      <FlatList
        ref={listRef}
        data={data}
        keyExtractor={(n) => String(n)}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        scrollEventThrottle={16}
        bounces={false}
        overScrollMode="never"
        contentContainerStyle={{ paddingVertical: PAD_ITEMS * ITEM_HEIGHT }}
        getItemLayout={(_, index) => ({
          length: ITEM_HEIGHT,
          offset: ITEM_HEIGHT * index,
          index,
        })}
        onMomentumScrollEnd={handleMomentumEnd}
        onScroll={handleScroll}
        renderItem={({ item, index }) => (
          <WheelItem index={index} value={item} scrollY={scrollY} />
        )}
      />

      {/* Center selection band */}
      <View
        pointerEvents="none"
        style={[
          styles.wheelCenterBand,
          { top: PAD_ITEMS * ITEM_HEIGHT, height: ITEM_HEIGHT },
        ]}
      />

      {/* Top fade — masks the off-center items into the sheet background */}
      <LinearGradient
        pointerEvents="none"
        colors={["#0a0a0a", "rgba(10,10,10,0)"]}
        style={[styles.wheelFadeTop, { height: PAD_ITEMS * ITEM_HEIGHT }]}
      />
      <LinearGradient
        pointerEvents="none"
        colors={["rgba(10,10,10,0)", "#0a0a0a"]}
        style={[styles.wheelFadeBottom, { height: PAD_ITEMS * ITEM_HEIGHT }]}
      />
    </View>
  );
}

interface WheelItemProps {
  index: number;
  value: number;
  scrollY: Animated.Value;
}

function WheelItem({ index, value, scrollY }: WheelItemProps) {
  const inputRange = [
    (index - 2) * ITEM_HEIGHT,
    (index - 1) * ITEM_HEIGHT,
    index * ITEM_HEIGHT,
    (index + 1) * ITEM_HEIGHT,
    (index + 2) * ITEM_HEIGHT,
  ];
  const opacity = scrollY.interpolate({
    inputRange,
    outputRange: [0.18, 0.45, 1, 0.45, 0.18],
    extrapolate: "clamp",
  });
  const scale = scrollY.interpolate({
    inputRange,
    outputRange: [0.82, 0.9, 1, 0.9, 0.82],
    extrapolate: "clamp",
  });
  return (
    <Animated.View
      style={[
        styles.wheelItem,
        { opacity, transform: [{ scale }] },
      ]}
    >
      <Text style={styles.wheelItemText} allowFontScaling={false}>
        {value}
      </Text>
    </Animated.View>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Styles                                                                     */
/* ────────────────────────────────────────────────────────────────────────── */

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
    marginBottom: 4,
  },
  panelsViewport: {
    flex: 1,
    overflow: "hidden",
  },
  panelsRow: {
    flex: 1,
    flexDirection: "row",
  },
  panel: {
    flexDirection: "column",
  },
  panelInner: {
    flex: 1,
  },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 52,
  },
  headerTitle: {
    fontSize: 17,
    color: "#f5f5f5",
    fontWeight: "600",
    letterSpacing: -0.2,
    paddingHorizontal: 4,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingRight: 12,
  },
  backBtnText: {
    color: "#d4d4d4",
    fontSize: 15,
    fontWeight: "500",
    marginLeft: 2,
  },

  // Search
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginBottom: 8,
    gap: 10,
  },
  searchWrap: {
    flex: 1,
    backgroundColor: "rgba(120,120,128,0.18)",
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
  },
  searchWrapFocused: {
    backgroundColor: "rgba(120,120,128,0.24)",
  },
  searchIcon: {
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    color: "#f5f5f5",
    fontSize: 17,
  },
  searchClear: {
    marginLeft: 6,
    padding: 2,
  },
  searchCancel: {
    paddingHorizontal: 2,
  },
  searchCancelText: {
    fontSize: 17,
    color: "#e8c078",
    fontWeight: "400",
  },
  emptyText: {
    color: "#737373",
    textAlign: "center",
    paddingVertical: 32,
    fontSize: 14,
  },

  // Surah row (list panel)
  surahRow: {
    height: SURAH_ROW_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  surahRowCurrent: {
    backgroundColor: "rgba(232,192,120,0.06)",
  },
  surahRowNumber: {
    width: 32,
    color: "#8e8e93",
    fontSize: 15,
    fontVariant: ["tabular-nums"],
    textAlign: "right",
    fontWeight: "400",
  },
  surahRowNumberCurrent: {
    color: "#e8c078",
  },
  surahRowText: {
    flex: 1,
    minWidth: 0,
  },
  surahRowTitle: {
    color: "#f5f5f5",
    fontSize: 17,
    fontWeight: "400",
  },
  surahRowSubtitle: {
    marginTop: 2,
    color: "#8e8e93",
    fontSize: 13,
  },
  surahRowArabic: {
    color: "#e5e5e5",
    fontFamily: "UthmanicHafs",
    fontSize: 20,
    includeFontPadding: false,
    textAlign: "right",
    minWidth: 70,
  },
  surahRowChev: {
    marginLeft: 4,
    opacity: 0.7,
  },

  // Ayah panel — surah identity card
  surahCardWrap: {
    paddingHorizontal: 24,
    paddingTop: 4,
    paddingBottom: 20,
    alignItems: "center",
  },
  surahCardEyebrow: {
    fontSize: 10,
    letterSpacing: 3,
    color: "#737373",
    fontWeight: "500",
    marginBottom: 6,
  },
  surahCardLatin: {
    fontSize: 17,
    color: "#f5f5f5",
    fontWeight: "600",
    letterSpacing: -0.2,
  },
  surahCardArabic: {
    marginTop: 6,
    fontSize: 26,
    color: "#f5f5f5",
    fontFamily: "UthmanicHafs",
    includeFontPadding: false,
    textAlign: "center",
  },
  surahCardMeta: {
    marginTop: 8,
    fontSize: 12,
    color: "#737373",
  },

  // Live verse preview
  previewWrap: {
    marginHorizontal: 24,
    marginBottom: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    minHeight: 110,
  },
  previewLabel: {
    fontSize: 10,
    letterSpacing: 3,
    color: "#a3a3a3",
    fontWeight: "500",
    marginBottom: 8,
  },
  previewArabic: {
    fontFamily: "UthmanicHafs",
    fontSize: 22,
    color: "#f5f5f5",
    textAlign: "right",
    writingDirection: "rtl",
    lineHeight: 38,
    includeFontPadding: false,
  },
  previewTranslation: {
    marginTop: 10,
    color: "#a3a3a3",
    fontSize: 13,
    lineHeight: 18,
  },

  // Wheel
  wheelWrap: {
    height: ITEM_HEIGHT * VISIBLE_ITEMS,
    width: "100%",
    marginBottom: 8,
  },
  wheelItem: {
    height: ITEM_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  wheelItemText: {
    color: "#f5f5f5",
    fontSize: 26,
    fontWeight: "500",
    fontVariant: ["tabular-nums"],
  },
  wheelCenterBand: {
    position: "absolute",
    left: 24,
    right: 24,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.08)",
  },
  wheelFadeTop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
  },
  wheelFadeBottom: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
  },

  // Confirm action
  confirmBar: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  confirmBtn: {
    backgroundColor: "#f5f5f5",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  confirmBtnText: {
    color: "#0a0a0a",
    fontSize: 15,
    fontWeight: "600",
    letterSpacing: -0.2,
  },
});
