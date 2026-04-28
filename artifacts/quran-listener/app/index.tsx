import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import {
  AudioStatus,
  createAudioPlayer,
  setAudioModeAsync,
  type AudioPlayer,
} from "expo-audio";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SettingsPanel } from "@/components/SettingsPanel";
import { SurahPicker } from "@/components/SurahPicker";
import { getAmbient } from "@/data/ambient";
import { getBackground } from "@/data/backgrounds";
import {
  ayahMarker,
  audioUrlForGlobalAyah,
  getSurah,
  reciter,
  validateQuran,
} from "@/data/quran";
import { getTransition } from "@/lib/transitions";
import { useSettings } from "@/lib/useSettings";

// For surahs longer than this, the per-ayah segmented progress row would
// shrink to invisible hairlines. Switch to a single overall progress bar
// + Ayah counter. (Al-Baqarah has 286 ayahs.)
const SEGMENTED_PROGRESS_MAX = 30;

export default function PlayerScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const {
    settings,
    hydrated,
    setTransition,
    setBackground,
    setAmbient,
    setAmbientVolume,
    setPosition,
    setAyah: persistAyah,
  } = useSettings();

  // Dev-only structural validation of the bundled Quran corpus. Surfaces
  // any drift loudly in the console instead of corrupting the UI silently.
  useEffect(() => {
    if (__DEV__) {
      const result = validateQuran();
      if (!result.ok) {
        // eslint-disable-next-line no-console
        console.error(
          `[quran] validation failed (${result.errors.length} error(s)):\n` +
            result.errors.slice(0, 10).join("\n"),
        );
      }
    }
  }, []);

  const surah = useMemo(() => getSurah(settings.surah), [settings.surah]);
  const ayahs = surah.ayahs;

  const transition = useMemo(
    () => getTransition(settings.transition),
    [settings.transition],
  );
  const backgroundOpt = useMemo(
    () => getBackground(settings.background),
    [settings.background],
  );

  // Local index lives outside `settings` because it changes on every audio
  // tick. We mirror it back to settings.ayah in a debounced effect so the
  // app resumes at the same ayah next launch.
  const [index, setIndex] = useState(() =>
    Math.max(0, Math.min(settings.ayah - 1, ayahs.length - 1)),
  );
  const [displayedIndex, setDisplayedIndex] = useState(index);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [hasFinished, setHasFinished] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerInitialStep, setPickerInitialStep] = useState<
    "surah" | "ayah"
  >("surah");

  // Auto-hide UI chrome (header, ayah counter, footer controls) — like a
  // video player. Tap anywhere to toggle. Only auto-hides while playing.
  const [chromeVisible, setChromeVisible] = useState(true);
  const chromeOpacity = useRef(new Animated.Value(1)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const HIDE_DELAY_MS = 3500;

  const indexRef = useRef(index);
  const isPlayingRef = useRef(isPlaying);
  const settingsOpenRef = useRef(settingsOpen);
  const pickerOpenRef = useRef(pickerOpen);
  useEffect(() => {
    indexRef.current = index;
  }, [index]);
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);
  useEffect(() => {
    settingsOpenRef.current = settingsOpen;
  }, [settingsOpen]);
  useEffect(() => {
    pickerOpenRef.current = pickerOpen;
  }, [pickerOpen]);

  const clearHideTimer = useCallback(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }, []);

  const scheduleHide = useCallback(() => {
    clearHideTimer();
    if (!isPlayingRef.current) return;
    if (settingsOpenRef.current || pickerOpenRef.current) return;
    hideTimer.current = setTimeout(() => {
      setChromeVisible(false);
    }, HIDE_DELAY_MS);
  }, [clearHideTimer]);

  const pokeControls = useCallback(() => {
    setChromeVisible(true);
    scheduleHide();
  }, [scheduleHide]);

  const toggleChrome = useCallback(() => {
    setChromeVisible((v) => !v);
  }, []);

  useEffect(() => {
    Animated.timing(chromeOpacity, {
      toValue: chromeVisible ? 1 : 0,
      duration: 280,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    }).start();
    if (chromeVisible) scheduleHide();
    else clearHideTimer();
  }, [chromeVisible, chromeOpacity, scheduleHide, clearHideTimer]);

  useEffect(() => {
    if (isPlaying) {
      scheduleHide();
    } else {
      clearHideTimer();
      setChromeVisible(true);
    }
  }, [isPlaying, scheduleHide, clearHideTimer]);

  useEffect(() => {
    if (settingsOpen || pickerOpen) {
      clearHideTimer();
      setChromeVisible(true);
    } else {
      scheduleHide();
    }
  }, [settingsOpen, pickerOpen, scheduleHide, clearHideTimer]);

  useEffect(() => () => clearHideTimer(), [clearHideTimer]);

  // === Per-surah playback bundle ===
  // A fresh bundle is created whenever the user switches surah. It owns the
  // lazy-allocated AudioPlayers and the per-ayah Animated.Values used for
  // crossfades. This means changing surah cleanly tears down the old ayah
  // count's worth of resources without leaving stale players behind.
  const bundle = useMemo(() => {
    const initialAyahIdx = Math.max(
      0,
      Math.min(settings.ayah - 1, ayahs.length - 1),
    );
    return {
      surahNumber: surah.number,
      players: ayahs.map(() => null as AudioPlayer | null),
      opacities: ayahs.map(
        (_, i) => new Animated.Value(i === initialAyahIdx ? 1 : 0),
      ),
    };
    // We intentionally key the bundle on surah.number alone — a change in
    // settings.ayah within the same surah must NOT rebuild players.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surah.number]);

  // Tear down the previous bundle's players when surah changes (and on
  // unmount). Without this, the ~ayahCount AudioPlayers from the prior
  // surah would linger until GC.
  const prevBundleRef = useRef(bundle);
  useEffect(() => {
    const prev = prevBundleRef.current;
    if (prev !== bundle) {
      for (const p of prev.players) {
        try {
          p?.remove();
        } catch {
          // ignore
        }
      }
      prevBundleRef.current = bundle;
    }
  }, [bundle]);
  useEffect(() => {
    return () => {
      for (const p of prevBundleRef.current.players) {
        try {
          p?.remove();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  const getPlayer = useCallback(
    (i: number): AudioPlayer => {
      let p = bundle.players[i];
      if (!p) {
        p = createAudioPlayer({
          uri: audioUrlForGlobalAyah(ayahs[i].globalNumber),
        });
        bundle.players[i] = p;
      }
      return p;
    },
    [bundle, ayahs],
  );

  const safePlay = (p: AudioPlayer | null | undefined) => {
    if (!p) return;
    try {
      const result = p.play() as unknown;
      if (
        result &&
        typeof (result as { catch?: unknown }).catch === "function"
      ) {
        (result as Promise<unknown>).catch(() => {});
      }
    } catch {
      // ignore
    }
  };
  const safePause = (p: AudioPlayer | null | undefined) => {
    if (!p) return;
    try {
      p.pause();
    } catch {
      // ignore
    }
  };
  const safeSeekZero = (p: AudioPlayer | null | undefined) => {
    if (!p) return;
    try {
      const r = p.seekTo(0) as unknown;
      if (
        r &&
        typeof (r as { catch?: unknown }).catch === "function"
      ) {
        (r as Promise<unknown>).catch(() => {});
      }
    } catch {
      // ignore
    }
  };

  // Eagerly create the player for the *current* ayah so the listener can
  // attach immediately (covers both first-mount and surah changes).
  if (bundle.players[index] == null) {
    bundle.players[index] = createAudioPlayer({
      uri: audioUrlForGlobalAyah(ayahs[index].globalNumber),
    });
  }

  // === Ambient player (independent — keeps looping while recitation plays) ===
  const ambientPlayerRef = useRef<AudioPlayer | null>(null);
  const currentAmbientRef = useRef<string>("off");

  const stageOpacity = useRef(new Animated.Value(1)).current;
  const transitionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cross-fade between background images.
  const bgFade = useRef(new Animated.Value(1)).current;
  const [activeBg, setActiveBg] = useState(settings.background);
  useEffect(() => {
    if (settings.background === activeBg) return;
    Animated.timing(bgFade, {
      toValue: 0,
      duration: 280,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    }).start(() => {
      setActiveBg(settings.background);
      Animated.timing(bgFade, {
        toValue: 1,
        duration: 380,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }).start();
    });
  }, [settings.background, activeBg, bgFade]);
  const activeBgOpt = getBackground(activeBg);

  // Audio session: play in silent mode and continue in the background
  // (lock-screen friendly on iOS).
  useEffect(() => {
    setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
    }).catch(() => {});
  }, []);

  // Audio status subscription — re-attaches whenever index OR surah changes.
  useEffect(() => {
    const player = getPlayer(index);
    setProgress(0);
    setIsLoading(true);

    const sub = player.addListener(
      "playbackStatusUpdate",
      (status: AudioStatus) => {
        if (indexRef.current !== index) return;
        if (!status.isLoaded) {
          setIsLoading(true);
          return;
        }
        setIsLoading(!!status.isBuffering);

        const dur = status.duration ?? 0;
        if (dur > 0) {
          setProgress(Math.min(100, (status.currentTime / dur) * 100));
        } else {
          setProgress(0);
        }

        if (status.didJustFinish) {
          const cur = indexRef.current;
          if (cur < ayahs.length - 1) {
            safePause(player);
            safeSeekZero(player);
            const next = getPlayer(cur + 1);
            if (isPlayingRef.current) {
              safePlay(next);
            }
            setIndex(cur + 1);
          } else {
            safePause(player);
            setIsPlaying(false);
            setHasFinished(true);
            setProgress(100);
          }
        }
      },
    );

    // Pre-create the next player so it can pre-load.
    if (index < ayahs.length - 1) {
      getPlayer(index + 1);
    }

    return () => {
      sub.remove();
    };
  }, [index, getPlayer, ayahs.length]);

  // Drive the visual transition between verses based on the chosen mode.
  // When the surah itself changes, we snap (no transition) — the new
  // bundle's opacities are already initialized to the picked ayah.
  const prevSurahForTransitionRef = useRef(surah.number);
  useEffect(() => {
    if (transitionTimer.current) {
      clearTimeout(transitionTimer.current);
      transitionTimer.current = null;
    }
    stageOpacity.stopAnimation();
    bundle.opacities.forEach((v) => v.stopAnimation());

    const surahChanged = prevSurahForTransitionRef.current !== surah.number;
    prevSurahForTransitionRef.current = surah.number;

    if (surahChanged) {
      stageOpacity.setValue(1);
      bundle.opacities.forEach((v, i) => v.setValue(i === index ? 1 : 0));
      setDisplayedIndex(index);
      return;
    }

    if (transition.throughBlack) {
      const half = transition.duration / 2;
      Animated.timing(stageOpacity, {
        toValue: 0,
        duration: half,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }).start();
      transitionTimer.current = setTimeout(() => {
        bundle.opacities.forEach((v, i) => v.setValue(i === index ? 1 : 0));
        setDisplayedIndex(index);
        Animated.timing(stageOpacity, {
          toValue: 1,
          duration: half,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }).start();
      }, half);
    } else {
      stageOpacity.setValue(1);
      setDisplayedIndex(index);
      const dur = transition.duration;
      bundle.opacities.forEach((v, i) => {
        const target = i === index ? 1 : 0;
        if (dur === 0) {
          v.setValue(target);
        } else {
          Animated.timing(v, {
            toValue: target,
            duration: dur,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }).start();
        }
      });
    }

    return () => {
      if (transitionTimer.current) {
        clearTimeout(transitionTimer.current);
        transitionTimer.current = null;
      }
    };
  }, [
    index,
    surah.number,
    bundle,
    transition.id,
    transition.duration,
    transition.throughBlack,
    stageOpacity,
  ]);

  // Persist the current ayah back to settings (debounced — only when the
  // value actually changes).
  useEffect(() => {
    if (!hydrated) return;
    persistAyah(index + 1);
  }, [index, hydrated, persistAyah]);

  // === Ambient audio: load when option changes, keep looping. ===
  useEffect(() => {
    const opt = getAmbient(settings.ambient);

    if (currentAmbientRef.current === opt.id) {
      const p = ambientPlayerRef.current;
      if (p) {
        try {
          p.volume = settings.ambientVolume;
        } catch {}
      }
      return;
    }

    try {
      ambientPlayerRef.current?.remove();
    } catch {}
    ambientPlayerRef.current = null;
    currentAmbientRef.current = opt.id;

    if (!opt.source) return;

    try {
      const p = createAudioPlayer(opt.source);
      try {
        p.loop = true;
        p.volume = settings.ambientVolume;
      } catch {}
      safePlay(p);
      ambientPlayerRef.current = p;
    } catch {}
  }, [settings.ambient, settings.ambientVolume]);

  useEffect(() => {
    return () => {
      try {
        ambientPlayerRef.current?.remove();
      } catch {}
    };
  }, []);

  const togglePlay = useCallback(() => {
    pokeControls();
    if (hasFinished) {
      setHasFinished(false);
      for (const p of bundle.players) {
        if (p) safeSeekZero(p);
      }
      const first = getPlayer(0);
      safePlay(first);
      setIndex(0);
      setIsPlaying(true);
      setProgress(0);
      return;
    }
    const player = getPlayer(indexRef.current);
    if (player.playing) {
      safePause(player);
      setIsPlaying(false);
    } else {
      setIsLoading(true);
      safePlay(player);
      setIsPlaying(true);
    }
  }, [hasFinished, getPlayer, bundle, pokeControls]);

  const goPrev = useCallback(() => {
    pokeControls();
    const cur = indexRef.current;
    if (cur > 0) {
      setHasFinished(false);
      const wasPlaying = isPlayingRef.current;
      const old = bundle.players[cur];
      if (old) {
        safePause(old);
        safeSeekZero(old);
      }
      const prev = getPlayer(cur - 1);
      safeSeekZero(prev);
      if (wasPlaying) safePlay(prev);
      setIndex(cur - 1);
    } else {
      const player = getPlayer(0);
      safeSeekZero(player);
    }
  }, [getPlayer, bundle, pokeControls]);

  const goNext = useCallback(() => {
    pokeControls();
    const cur = indexRef.current;
    if (cur < ayahs.length - 1) {
      setHasFinished(false);
      const wasPlaying = isPlayingRef.current;
      const old = bundle.players[cur];
      if (old) {
        safePause(old);
        safeSeekZero(old);
      }
      const next = getPlayer(cur + 1);
      safeSeekZero(next);
      if (wasPlaying) safePlay(next);
      setIndex(cur + 1);
    }
  }, [getPlayer, bundle, ayahs.length, pokeControls]);

  const restart = useCallback(() => {
    pokeControls();
    setHasFinished(false);
    const cur = indexRef.current;
    const old = bundle.players[cur];
    if (old) {
      safePause(old);
      safeSeekZero(old);
    }
    for (let i = 0; i < bundle.players.length; i++) {
      if (i === cur) continue;
      const p = bundle.players[i];
      if (p) safeSeekZero(p);
    }
    const first = getPlayer(0);
    safeSeekZero(first);
    safePlay(first);
    setIndex(0);
    setIsPlaying(true);
    setProgress(0);
  }, [getPlayer, bundle, pokeControls]);

  // Picker callback — switches surah and/or jumps to a specific ayah.
  // Pauses current playback before switching so we don't bleed audio across
  // surahs.
  const handlePickPosition = useCallback(
    (surahNumber: number, ayahNumber: number) => {
      const cur = bundle.players[indexRef.current];
      if (cur) safePause(cur);
      setIsPlaying(false);
      setHasFinished(false);
      setProgress(0);
      const newIndex = ayahNumber - 1;
      // If only the ayah changed within the same surah, no bundle rebuild
      // happens — we just need to seek the existing player.
      if (surahNumber === surah.number) {
        const oldPlayer = bundle.players[indexRef.current];
        if (oldPlayer) safeSeekZero(oldPlayer);
        setIndex(newIndex);
        setDisplayedIndex(newIndex);
      } else {
        setIndex(newIndex);
        setDisplayedIndex(newIndex);
      }
      setPosition(surahNumber, ayahNumber);
      setPickerOpen(false);
    },
    [bundle, surah.number, setPosition],
  );

  // Responsive Arabic font size — Mushaf-quality at every breakpoint.
  const arabicFontSize = useMemo(() => {
    if (width >= 900) return 60;
    if (width >= 700) return 52;
    if (width >= 500) return 44;
    if (width >= 380) return 36;
    return 32;
  }, [width]);

  const translationFontSize = width >= 700 ? 16 : 14;

  const topPad =
    Platform.OS === "web" ? Math.max(insets.top, 24) : insets.top + 8;
  const bottomPad =
    Platform.OS === "web" ? Math.max(insets.bottom, 24) : insets.bottom + 12;

  const hasBg = !!activeBgOpt.source;

  // Overall progress across the whole surah (only used for long surahs that
  // fall back to a single progress bar).
  const overallProgress =
    ((index + Math.min(progress, 100) / 100) / Math.max(1, ayahs.length)) * 100;

  return (
    <View style={styles.root}>
      {/* === Background image layer === */}
      <Animated.View
        style={[StyleSheet.absoluteFill, { opacity: bgFade }]}
        pointerEvents="none"
      >
        {hasBg && activeBgOpt.source && (
          <Image
            source={activeBgOpt.source}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={0}
          />
        )}
        <LinearGradient
          colors={
            hasBg
              ? [
                  "rgba(0,0,0,0.55)",
                  "rgba(0,0,0,0.35)",
                  "rgba(0,0,0,0.55)",
                  "rgba(0,0,0,0.85)",
                ]
              : ["#000", "#000", "#000", "#000"]
          }
          locations={[0, 0.4, 0.7, 1]}
          style={StyleSheet.absoluteFill}
        />
        {!hasBg && (
          <View
            style={[StyleSheet.absoluteFill, styles.warmGlow]}
            pointerEvents="none"
          />
        )}
      </Animated.View>

      {/* === Tap-to-toggle layer wraps the chrome + stage === */}
      <Pressable
        style={styles.pressArea}
        onPress={toggleChrome}
        android_disableSound
      >
        {/* === Header === */}
        <Animated.View
          style={[
            styles.header,
            { paddingTop: topPad, opacity: chromeOpacity },
          ]}
          pointerEvents={chromeVisible ? "auto" : "none"}
        >
          <TouchableOpacity
            style={styles.headerLeft}
            onPress={() => {
              pokeControls();
              setPickerInitialStep("surah");
              setPickerOpen(true);
            }}
            accessibilityLabel="Choose surah"
            activeOpacity={0.7}
          >
            <Text style={styles.eyebrow}>SURAH {surah.number}</Text>
            <View style={styles.headerLeftTitleRow}>
              <Text style={styles.surahLabel} numberOfLines={1}>
                {surah.nameLatin}{" "}
                <Text style={styles.surahMeaning}>— {surah.meaning}</Text>
              </Text>
              <Feather
                name="chevron-down"
                size={14}
                color="#737373"
                style={styles.chev}
              />
            </View>
          </TouchableOpacity>
          <View style={styles.headerRight}>
            <TouchableOpacity
              onPress={() => {
                pokeControls();
                setSettingsOpen(true);
              }}
              accessibilityLabel="Settings"
              hitSlop={10}
              style={styles.iconBtn}
              activeOpacity={0.7}
            >
              <Feather name="settings" size={20} color="#d4d4d4" />
            </TouchableOpacity>
            <Text
              style={styles.surahArabic}
              allowFontScaling={false}
              numberOfLines={1}
            >
              {surah.nameArabic}
            </Text>
          </View>
        </Animated.View>

        {/* === Ayah counter — tap to open picker at current ayah === */}
        <Animated.View
          style={[styles.counterWrap, { opacity: chromeOpacity }]}
          pointerEvents={chromeVisible ? "auto" : "none"}
        >
          <TouchableOpacity
            onPress={() => {
              pokeControls();
              setPickerInitialStep("ayah");
              setPickerOpen(true);
            }}
            hitSlop={10}
            activeOpacity={0.7}
            accessibilityLabel="Choose ayah"
          >
            <Text style={styles.counter}>
              AYAH {ayahs[index].number} OF {ayahs.length}
            </Text>
          </TouchableOpacity>
        </Animated.View>

        {/* === Stage — only the displayed and incoming ayahs are mounted at
            full opacity at any given time. Verses are non-interactive so taps
            fall through to the parent Pressable. === */}
        <Animated.View
          style={[styles.stage, { opacity: stageOpacity }]}
          pointerEvents="box-none"
        >
          {ayahs.map((a, i) => {
            // Skip mounting verses that are guaranteed off-screen and not
            // animating — saves rendering ~280 hidden views for Al-Baqarah.
            const isLive = i === index || i === displayedIndex;
            if (!isLive) return null;
            return (
              <Animated.View
                key={`${surah.number}-${a.number}`}
                pointerEvents="none"
                style={[
                  StyleSheet.absoluteFill,
                  styles.verseBox,
                  { opacity: bundle.opacities[i] },
                ]}
              >
                <Text
                  style={[
                    styles.arabic,
                    {
                      fontSize: arabicFontSize,
                      lineHeight: arabicFontSize * 1.9,
                    },
                  ]}
                  allowFontScaling={false}
                >
                  {a.arabic}
                  {ayahMarker(a.number)}
                </Text>
                <Text
                  style={[
                    styles.translation,
                    { fontSize: translationFontSize },
                  ]}
                >
                  {a.translation}
                </Text>
              </Animated.View>
            );
          })}
        </Animated.View>

        {/* === Footer / controls === */}
        <Animated.View
          style={[
            styles.footer,
            { paddingBottom: bottomPad, opacity: chromeOpacity },
          ]}
          pointerEvents={chromeVisible ? "auto" : "none"}
        >
          {ayahs.length <= SEGMENTED_PROGRESS_MAX ? (
            <View style={styles.progressRow}>
              {ayahs.map((a, i) => {
                const fill = i < index ? 100 : i === index ? progress : 0;
                return (
                  <View key={a.number} style={styles.progressTrack}>
                    <View
                      style={[styles.progressFill, { width: `${fill}%` }]}
                    />
                  </View>
                );
              })}
            </View>
          ) : (
            <View style={styles.singleProgressRow}>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${overallProgress}%` },
                  ]}
                />
              </View>
            </View>
          )}

          <View style={styles.controlsRow}>
            <View style={styles.reciterCol}>
              <Text style={styles.reciterEyebrow}>RECITER</Text>
              <Text style={styles.reciterName} numberOfLines={1}>
                {reciter}
              </Text>
            </View>

            <View style={styles.controlsCenter}>
              <TouchableOpacity
                onPress={goPrev}
                accessibilityLabel="Previous ayah"
                disabled={index === 0 && progress < 1}
                hitSlop={10}
                style={styles.iconBtn}
                activeOpacity={0.7}
              >
                <Feather
                  name="skip-back"
                  size={22}
                  color={
                    index === 0 && progress < 1 ? "#3a3a3a" : "#d4d4d4"
                  }
                />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={togglePlay}
                accessibilityLabel={isPlaying ? "Pause" : "Play"}
                activeOpacity={0.85}
                style={styles.playBtn}
              >
                <Feather
                  name={
                    hasFinished ? "rotate-ccw" : isPlaying ? "pause" : "play"
                  }
                  size={26}
                  color="#000"
                  style={
                    !hasFinished && !isPlaying
                      ? { marginLeft: 2 }
                      : undefined
                  }
                />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={goNext}
                accessibilityLabel="Next ayah"
                disabled={index === ayahs.length - 1}
                hitSlop={10}
                style={styles.iconBtn}
                activeOpacity={0.7}
              >
                <Feather
                  name="skip-forward"
                  size={22}
                  color={
                    index === ayahs.length - 1 ? "#3a3a3a" : "#d4d4d4"
                  }
                />
              </TouchableOpacity>
            </View>

            <View style={styles.restartCol}>
              <TouchableOpacity
                onPress={restart}
                hitSlop={8}
                activeOpacity={0.6}
              >
                <Text style={styles.restartText}>RESTART</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>
      </Pressable>

      {isLoading && isPlaying && (
        <View style={styles.loadingPulse} pointerEvents="none" />
      )}

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        transition={settings.transition}
        background={settings.background}
        ambient={settings.ambient}
        ambientVolume={settings.ambientVolume}
        onTransitionChange={setTransition}
        onBackgroundChange={setBackground}
        onAmbientChange={setAmbient}
        onAmbientVolumeChange={setAmbientVolume}
      />

      <SurahPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        currentSurah={surah.number}
        currentAyah={index + 1}
        onSelect={handlePickPosition}
        initialStep={pickerInitialStep}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#000",
  },
  pressArea: {
    flex: 1,
    flexDirection: "column",
  },
  warmGlow: {
    backgroundColor: "transparent",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: 24,
    paddingBottom: 8,
  },
  headerLeft: {
    flex: 1,
    paddingRight: 12,
  },
  headerLeftTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  chev: {
    marginLeft: 6,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  eyebrow: {
    fontSize: 10,
    letterSpacing: 3,
    color: "#a3a3a3",
    fontWeight: "500",
  },
  surahLabel: {
    fontSize: 15,
    color: "#f5f5f5",
    fontWeight: "500",
    flexShrink: 1,
  },
  surahMeaning: {
    color: "#a3a3a3",
    fontWeight: "400",
  },
  surahArabic: {
    fontSize: 22,
    color: "#f5f5f5",
    fontFamily: "UthmanicHafs",
    includeFontPadding: false,
    maxWidth: 180,
  },
  iconBtn: {
    padding: 8,
    borderRadius: 999,
  },
  counterWrap: {
    alignItems: "center",
    paddingTop: 12,
    paddingBottom: 4,
  },
  counter: {
    fontSize: 11,
    letterSpacing: 5,
    color: "#a3a3a3",
    fontWeight: "500",
  },
  stage: {
    flex: 1,
    marginHorizontal: 16,
    position: "relative",
  },
  verseBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  arabic: {
    color: "#fff",
    fontFamily: "UthmanicHafs",
    textAlign: "center",
    writingDirection: "rtl",
    includeFontPadding: false,
    textShadowColor: "rgba(0, 0, 0, 0.6)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 24,
  },
  translation: {
    marginTop: 28,
    color: "#d4d4d4",
    textAlign: "center",
    lineHeight: 22,
    maxWidth: 560,
    textShadowColor: "rgba(0, 0, 0, 0.7)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  progressRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 18,
  },
  singleProgressRow: {
    marginBottom: 18,
  },
  progressTrack: {
    flex: 1,
    height: 3,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.18)",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#f5f5f5",
    borderRadius: 999,
  },
  controlsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  reciterCol: {
    flex: 1,
    minWidth: 0,
  },
  reciterEyebrow: {
    fontSize: 9,
    letterSpacing: 3,
    color: "#737373",
    fontWeight: "500",
  },
  reciterName: {
    marginTop: 4,
    fontSize: 12,
    color: "#d4d4d4",
  },
  controlsCenter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 24,
  },
  playBtn: {
    width: 64,
    height: 64,
    borderRadius: 999,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
  },
  restartCol: {
    flex: 1,
    alignItems: "flex-end",
  },
  restartText: {
    fontSize: 10,
    letterSpacing: 3,
    color: "#a3a3a3",
    fontWeight: "500",
  },
  loadingPulse: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
});
