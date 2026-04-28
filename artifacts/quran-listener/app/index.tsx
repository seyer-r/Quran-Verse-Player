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
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SettingsPanel } from "@/components/SettingsPanel";
import { getAmbient } from "@/data/ambient";
import { getBackground } from "@/data/backgrounds";
import {
  ayahMarker,
  ayahs,
  reciter,
  surahMeaning,
  surahName,
  surahNameArabic,
} from "@/data/al-fatiha";
import { getTransition } from "@/lib/transitions";
import { useSettings } from "@/lib/useSettings";

export default function PlayerScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const {
    settings,
    setTransition,
    setBackground,
    setAmbient,
    setAmbientVolume,
  } = useSettings();
  const transition = useMemo(
    () => getTransition(settings.transition),
    [settings.transition],
  );
  const backgroundOpt = useMemo(
    () => getBackground(settings.background),
    [settings.background],
  );

  const [index, setIndex] = useState(0);
  // displayedIndex lags `index` while a "through black" transition runs.
  const [displayedIndex, setDisplayedIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [hasFinished, setHasFinished] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const indexRef = useRef(index);
  const isPlayingRef = useRef(isPlaying);
  useEffect(() => {
    indexRef.current = index;
  }, [index]);
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  // === Recitation player ===
  const playerRef = useRef<AudioPlayer | null>(null);
  if (playerRef.current === null) {
    playerRef.current = createAudioPlayer(ayahs[0].audioUrl);
  }

  // === Ambient player (independent — keeps looping while recitation plays) ===
  const ambientPlayerRef = useRef<AudioPlayer | null>(null);
  const currentAmbientRef = useRef<string>("off");

  // Animated values for the crossfade & blackout stage.
  const stageOpacity = useRef(new Animated.Value(1)).current;
  const verseOpacities = useRef(
    ayahs.map((_, i) => new Animated.Value(i === 0 ? 1 : 0)),
  ).current;
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

  // Set audio session mode once on mount: play in silent mode and continue
  // in the background (lock-screen friendly on iOS).
  useEffect(() => {
    setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
    }).catch(() => {
      // best-effort; some web/dev environments will reject
    });
  }, []);

  // Audio status subscription — drives progress and auto-advance.
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;

    const sub = player.addListener(
      "playbackStatusUpdate",
      (status: AudioStatus) => {
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
            setIndex(cur + 1);
          } else {
            setIsPlaying(false);
            setHasFinished(true);
            setProgress(100);
          }
        }
      },
    );

    return () => {
      sub.remove();
    };
  }, []);

  // Load a new track whenever index changes.
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    setProgress(0);
    setIsLoading(true);
    try {
      player.replace({ uri: ayahs[index].audioUrl });
      if (isPlayingRef.current) {
        player.play();
      }
    } catch {
      setIsLoading(false);
    }
  }, [index]);

  // Drive the visual transition between verses based on the chosen mode.
  useEffect(() => {
    if (transitionTimer.current) {
      clearTimeout(transitionTimer.current);
      transitionTimer.current = null;
    }
    stageOpacity.stopAnimation();
    verseOpacities.forEach((v) => v.stopAnimation());

    if (transition.throughBlack) {
      const half = transition.duration / 2;
      Animated.timing(stageOpacity, {
        toValue: 0,
        duration: half,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }).start();
      transitionTimer.current = setTimeout(() => {
        verseOpacities.forEach((v, i) => v.setValue(i === index ? 1 : 0));
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
      verseOpacities.forEach((v, i) => {
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
    transition.id,
    transition.duration,
    transition.throughBlack,
    stageOpacity,
    verseOpacities,
  ]);

  // === Ambient audio: load when option changes, keep looping. ===
  useEffect(() => {
    const opt = getAmbient(settings.ambient);

    // If the same source is already loaded, just sync volume.
    if (currentAmbientRef.current === opt.id) {
      const p = ambientPlayerRef.current;
      if (p) {
        try {
          p.volume = settings.ambientVolume;
        } catch {
          // ignore
        }
      }
      return;
    }

    // Tear down the previous ambient player.
    try {
      ambientPlayerRef.current?.remove();
    } catch {
      // ignore
    }
    ambientPlayerRef.current = null;
    currentAmbientRef.current = opt.id;

    if (!opt.source) return;

    try {
      const p = createAudioPlayer(opt.source);
      try {
        p.loop = true;
        p.volume = settings.ambientVolume;
      } catch {
        // ignore
      }
      p.play();
      ambientPlayerRef.current = p;
    } catch {
      // ignore
    }
  }, [settings.ambient, settings.ambientVolume]);

  // Cleanup both players on unmount.
  useEffect(() => {
    return () => {
      try {
        playerRef.current?.remove();
      } catch {
        // ignore
      }
      try {
        ambientPlayerRef.current?.remove();
      } catch {
        // ignore
      }
    };
  }, []);

  const togglePlay = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    if (hasFinished) {
      // Restart from the beginning. Force-reload track 0 even if index is
      // already 0, so the source effect doesn't get short-circuited.
      setHasFinished(false);
      try {
        player.replace({ uri: ayahs[0].audioUrl });
        player.play();
      } catch {
        // ignore
      }
      setIndex(0);
      setIsPlaying(true);
      setProgress(0);
      return;
    }
    if (player.playing) {
      player.pause();
      setIsPlaying(false);
    } else {
      setIsLoading(true);
      try {
        player.play();
        setIsPlaying(true);
      } catch {
        setIsPlaying(false);
        setIsLoading(false);
      }
    }
  }, [hasFinished]);

  const goPrev = useCallback(() => {
    if (index > 0) {
      setHasFinished(false);
      setIndex(index - 1);
    } else {
      const player = playerRef.current;
      if (player) {
        try {
          player.seekTo(0);
        } catch {
          // ignore
        }
      }
    }
  }, [index]);

  const goNext = useCallback(() => {
    if (index < ayahs.length - 1) {
      setHasFinished(false);
      setIndex(index + 1);
    }
  }, [index]);

  const restart = useCallback(() => {
    const player = playerRef.current;
    setHasFinished(false);
    try {
      player?.replace({ uri: ayahs[0].audioUrl });
      player?.play();
    } catch {
      // ignore
    }
    setIndex(0);
    setIsPlaying(true);
    setProgress(0);
  }, []);

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
        {/* Vertical scrim — keeps text readable over any photo. */}
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
        {/* Subtle warm glow behind text when no photo background */}
        {!hasBg && (
          <View
            style={[
              StyleSheet.absoluteFill,
              styles.warmGlow,
            ]}
            pointerEvents="none"
          />
        )}
      </Animated.View>

      {/* === Header === */}
      <View style={[styles.header, { paddingTop: topPad }]}>
        <View style={styles.headerLeft}>
          <Text style={styles.eyebrow}>SURAH 1</Text>
          <Text style={styles.surahLabel}>
            {surahName}{" "}
            <Text style={styles.surahMeaning}>— {surahMeaning}</Text>
          </Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity
            onPress={() => setSettingsOpen(true)}
            accessibilityLabel="Settings"
            hitSlop={10}
            style={styles.iconBtn}
            activeOpacity={0.7}
          >
            <Feather name="settings" size={20} color="#d4d4d4" />
          </TouchableOpacity>
          <Text style={styles.surahArabic}>{surahNameArabic}</Text>
        </View>
      </View>

      {/* === Ayah counter === */}
      <View style={styles.counterWrap}>
        <Text style={styles.counter}>
          AYAH {ayahs[index].number} OF {ayahs.length}
        </Text>
      </View>

      {/* === Stage — verses stacked & opacity-toggled === */}
      <Animated.View style={[styles.stage, { opacity: stageOpacity }]}>
        {ayahs.map((a, i) => (
          <Animated.View
            key={a.number}
            pointerEvents={i === displayedIndex ? "auto" : "none"}
            style={[
              StyleSheet.absoluteFill,
              styles.verseBox,
              { opacity: verseOpacities[i] },
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
              style={[styles.translation, { fontSize: translationFontSize }]}
            >
              {a.translation}
            </Text>
          </Animated.View>
        ))}
      </Animated.View>

      {/* === Footer / controls === */}
      <View style={[styles.footer, { paddingBottom: bottomPad }]}>
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
                  !hasFinished && !isPlaying ? { marginLeft: 2 } : undefined
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
                color={index === ayahs.length - 1 ? "#3a3a3a" : "#d4d4d4"}
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
      </View>

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
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#000",
  },
  warmGlow: {
    backgroundColor: "transparent",
    // A radial-ish glow is hard in RN — emulate with a centered translucent view
    // via shadow. We keep it minimal here so the all-black variant stays clean.
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
    marginTop: 4,
    fontSize: 15,
    color: "#f5f5f5",
    fontWeight: "500",
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
