import { Feather } from "@expo/vector-icons";
import {
  AudioStatus,
  createAudioPlayer,
  setAudioModeAsync,
  type AudioPlayer,
} from "expo-audio";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

  const { settings, setTransition } = useSettings();
  const transition = useMemo(
    () => getTransition(settings.transition),
    [settings.transition],
  );

  const [index, setIndex] = useState(0);
  // displayedIndex lags `index` while a "through black" transition runs.
  const [displayedIndex, setDisplayedIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [hasFinished, setHasFinished] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Refs that the audio status callback needs without re-subscribing.
  const indexRef = useRef(index);
  const isPlayingRef = useRef(isPlaying);
  useEffect(() => {
    indexRef.current = index;
  }, [index]);
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  // One audio player for the whole session — we just swap the source.
  const playerRef = useRef<AudioPlayer | null>(null);
  if (playerRef.current === null) {
    playerRef.current = createAudioPlayer(ayahs[0].audioUrl);
  }

  // Animated values for the crossfade & blackout stage.
  const stageOpacity = useRef(new Animated.Value(1)).current;
  const verseOpacities = useRef(
    ayahs.map((_, i) => new Animated.Value(i === 0 ? 1 : 0)),
  ).current;
  const transitionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

    const sub = player.addListener("playbackStatusUpdate", (status: AudioStatus) => {
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
          // advance via state — the index effect below loads the next track.
          setIndex(cur + 1);
        } else {
          setIsPlaying(false);
          setHasFinished(true);
          setProgress(100);
        }
      }
    });

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
      // Phase 1: fade the current verse to black.
      Animated.timing(stageOpacity, {
        toValue: 0,
        duration: half,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }).start();
      // Phase 2: once black, swap to the new verse, then fade back in.
      transitionTimer.current = setTimeout(() => {
        // Snap verse opacities to show only the new verse.
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
      // Crossfade modes (incl. instant): stage stays at 1, opacity-toggle the
      // verses in place so old fades out as new fades in.
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
  }, [index, transition.id, transition.duration, transition.throughBlack, stageOpacity, verseOpacities]);

  // Cleanup the player on unmount.
  useEffect(() => {
    return () => {
      try {
        playerRef.current?.remove();
      } catch {
        // ignore
      }
    };
  }, []);

  const togglePlay = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    if (hasFinished) {
      setHasFinished(false);
      setIndex(0);
      setIsPlaying(true);
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
    setHasFinished(false);
    setIndex(0);
    setIsPlaying(true);
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

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 24) : insets.top + 8;
  const bottomPad = Platform.OS === "web" ? Math.max(insets.bottom, 24) : insets.bottom + 12;

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad }]}>
        <View style={styles.headerLeft}>
          <Text style={styles.eyebrow}>SURAH 1</Text>
          <Text style={styles.surahLabel}>
            {surahName} <Text style={styles.surahMeaning}>— {surahMeaning}</Text>
          </Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity
            onPress={() => setSettingsOpen(true)}
            accessibilityLabel="Settings"
            hitSlop={10}
            style={styles.iconBtn}
          >
            <Feather name="settings" size={20} color="#a3a3a3" />
          </TouchableOpacity>
          <Text style={styles.surahArabic}>{surahNameArabic}</Text>
        </View>
      </View>

      {/* Ayah counter */}
      <View style={styles.counterWrap}>
        <Text style={styles.counter}>
          AYAH {ayahs[index].number} OF {ayahs.length}
        </Text>
      </View>

      {/* Stage — all verses stacked & opacity-toggled. The container is
          `flex: 1` so changing verse can never shift surrounding layout. */}
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
              style={[
                styles.translation,
                { fontSize: translationFontSize },
              ]}
            >
              {a.translation}
            </Text>
          </Animated.View>
        ))}
      </Animated.View>

      {/* Footer / controls */}
      <View style={[styles.footer, { paddingBottom: bottomPad }]}>
        {/* Per-ayah progress bar */}
        <View style={styles.progressRow}>
          {ayahs.map((a, i) => {
            const fill = i < index ? 100 : i === index ? progress : 0;
            return (
              <View key={a.number} style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${fill}%` }]} />
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
            >
              <Feather
                name="skip-back"
                size={20}
                color={index === 0 && progress < 1 ? "#3a3a3a" : "#a3a3a3"}
              />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={togglePlay}
              accessibilityLabel={isPlaying ? "Pause" : "Play"}
              activeOpacity={0.85}
              style={styles.playBtn}
            >
              <Feather
                name={hasFinished ? "rotate-ccw" : isPlaying ? "pause" : "play"}
                size={26}
                color="#000"
                style={!hasFinished && !isPlaying ? { marginLeft: 2 } : undefined}
              />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={goNext}
              accessibilityLabel="Next ayah"
              disabled={index === ayahs.length - 1}
              hitSlop={10}
              style={styles.iconBtn}
            >
              <Feather
                name="skip-forward"
                size={20}
                color={index === ayahs.length - 1 ? "#3a3a3a" : "#a3a3a3"}
              />
            </TouchableOpacity>
          </View>

          <View style={styles.restartCol}>
            <TouchableOpacity onPress={restart} hitSlop={8}>
              <Text style={styles.restartText}>RESTART</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Subtle loading hint — only when audio is buffering and we are playing */}
      {isLoading && isPlaying && <View style={styles.loadingPulse} pointerEvents="none" />}

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        transition={settings.transition}
        onTransitionChange={setTransition}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#000",
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
    color: "#737373",
    fontWeight: "500",
  },
  surahLabel: {
    marginTop: 4,
    fontSize: 15,
    color: "#e5e5e5",
    fontWeight: "500",
  },
  surahMeaning: {
    color: "#737373",
    fontWeight: "400",
  },
  surahArabic: {
    fontSize: 22,
    color: "#e5e5e5",
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
    color: "#737373",
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
    textShadowColor: "rgba(255, 220, 160, 0.18)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 24,
  },
  translation: {
    marginTop: 28,
    color: "#a3a3a3",
    textAlign: "center",
    lineHeight: 22,
    maxWidth: 560,
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
    backgroundColor: "#262626",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#e5e5e5",
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
    color: "#525252",
    fontWeight: "500",
  },
  reciterName: {
    marginTop: 4,
    fontSize: 12,
    color: "#a3a3a3",
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
    shadowColor: "#fff",
    shadowOpacity: 0.15,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
  },
  restartCol: {
    flex: 1,
    alignItems: "flex-end",
  },
  restartText: {
    fontSize: 10,
    letterSpacing: 3,
    color: "#737373",
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
