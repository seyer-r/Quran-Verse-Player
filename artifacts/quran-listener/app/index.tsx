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
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SettingsPanel } from "@/components/SettingsPanel";
import { SurahPicker } from "@/components/SurahPicker";
import { AMBIENT_OPTIONS, type AmbientId, getAmbient } from "@/data/ambient";
import { getBackground } from "@/data/backgrounds";
import {
  ayahMarker,
  audioUrlForGlobalAyah,
  getSurah,
  reciter,
  TOTAL_SURAHS,
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
    setAutoplayNextSurah,
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
  // Mirrors settings.autoplayNextSurah for the audio listener closure,
  // which is set up once per (surah, index) and otherwise wouldn't see
  // settings changes between attaches.
  const autoplayNextSurahRef = useRef(settings.autoplayNextSurah);
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
  useEffect(() => {
    autoplayNextSurahRef.current = settings.autoplayNextSurah;
  }, [settings.autoplayNextSurah]);

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

  // pokeControls already does what we want for "tap anywhere": show the
  // chrome and reset the auto-hide timer. We never hide on tap — auto-hide
  // is the only way the chrome disappears.

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
        (result as Promise<unknown>).catch((err) => {
          if (__DEV__) console.warn("[audio] play() rejected:", err);
        });
      }
    } catch (err) {
      if (__DEV__) console.warn("[audio] play() threw:", err);
    }
  };
  const safePause = (p: AudioPlayer | null | undefined) => {
    if (!p) return;
    try {
      p.pause();
    } catch (err) {
      if (__DEV__) console.warn("[audio] pause() threw:", err);
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
        (r as Promise<unknown>).catch((err) => {
          if (__DEV__) console.warn("[audio] seekTo(0) rejected:", err);
        });
      }
    } catch (err) {
      if (__DEV__) console.warn("[audio] seekTo(0) threw:", err);
    }
  };

  // (Player for the current ayah is created lazily by the audio listener
  // effect via getPlayer(index). We deliberately avoid creating it during
  // render — under React 18 StrictMode the render runs twice and we'd leak
  // the first AudioPlayer instance.)

  // === Ambient players ===
  // We pre-create one persistent AudioPlayer per ambient sound on first mount.
  // Switching ambient sounds then becomes "pause old, play new" with no
  // construction/load delay (the previous "create player on demand" approach
  // had a noticeable ~1s gap between selection and audio starting). Holding
  // all five players also makes the volume slider behave reliably — the
  // volume effect can apply the new value to every existing player rather
  // than racing with player creation.
  const ambientPlayersRef = useRef<Partial<Record<AmbientId, AudioPlayer>>>({});

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

  // (Audio session — `playsInSilentMode`, `shouldPlayInBackground`,
  //  `interruptionMode: 'mixWithOthers'` — is configured at module scope in
  //  `app/_layout.tsx`. Doing it here would race with the ambient/recitation
  //  player constructors that fire on the same render and on iOS the first
  //  player to load grabs an exclusive audio session before the mode change
  //  takes effect.)

  // Set true by handlePickPosition when the user just confirmed an ayah
  // and we want to start playback as soon as the new bundle's listener
  // attaches. This bridges the gap between "switch surah" (which causes a
  // bundle rebuild) and "play the picked ayah".
  const shouldAutoPlayRef = useRef(false);

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
            // End of surah. If auto-advance is on and we're not yet at the
            // last surah (114), jump to ayah 1 of the next surah and let
            // the bundle-rebuild + listener re-attach pick up playback via
            // the shouldAutoPlay flag (same path used by the picker for a
            // cross-surah jump).
            safePause(player);
            const wasPlaying = isPlayingRef.current;
            const canAdvance =
              autoplayNextSurahRef.current &&
              wasPlaying &&
              surah.number < TOTAL_SURAHS;
            if (canAdvance) {
              shouldAutoPlayRef.current = true;
              setProgress(0);
              setHasFinished(false);
              setIsLoading(true);
              setIsPlaying(true);
              // Reset local index BEFORE the settings update so when the
              // new bundle mounts (with ayah 1) the index already aligns.
              setIndex(0);
              setDisplayedIndex(0);
              setPosition(surah.number + 1, 1);
            } else {
              setIsPlaying(false);
              setHasFinished(true);
              setProgress(100);
            }
          }
        }
      },
    );

    // Pre-create the next player so it can pre-load.
    if (index < ayahs.length - 1) {
      getPlayer(index + 1);
    }

    // If the user just confirmed an ayah from the picker for a *different*
    // surah, the bundle was rebuilt and we now have a fresh player attached.
    // Start playback now — that's what the picker's "Listen from ayah N"
    // CTA promised.
    if (shouldAutoPlayRef.current) {
      shouldAutoPlayRef.current = false;
      safeSeekZero(player);
      safePlay(player);
      setIsPlaying(true);
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

  // Tracks whether the user has tapped *anything* (play / next / settings /
  // volume / picker) at least once. Browsers reject HTMLAudioElement.play()
  // with NotAllowedError unless there's an active user-gesture grant, so on
  // web we defer ambient autoplay until that first tap. On native this is a
  // no-op (initialised true).
  const userGestureGrantedRef = useRef(Platform.OS !== "web");

  // Pre-create every ambient player ONCE so switching sounds is instant and
  // the volume slider always has a player to apply to.
  useEffect(() => {
    for (const opt of AMBIENT_OPTIONS) {
      if (!opt.source) continue;
      if (ambientPlayersRef.current[opt.id]) continue;
      try {
        const p = createAudioPlayer(opt.source);
        try {
          p.loop = true;
          p.volume = settings.ambientVolume;
        } catch {}
        ambientPlayersRef.current[opt.id] = p;
      } catch (err) {
        if (__DEV__)
          console.warn(`[audio] ambient pre-create failed (${opt.id}):`, err);
      }
    }
    return () => {
      for (const id of Object.keys(ambientPlayersRef.current) as AmbientId[]) {
        try {
          ambientPlayersRef.current[id]?.remove();
        } catch {}
        delete ambientPlayersRef.current[id];
      }
    };
    // settings.ambientVolume intentionally not a dep — initial volume only;
    // subsequent volume changes are handled by the dedicated volume effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Switch which ambient is playing. Pause every other player; play the
  // selected one. Runs whenever the user picks a new ambient *and* once
  // settings hydrate from storage.
  useEffect(() => {
    if (!hydrated) return;
    for (const id of Object.keys(ambientPlayersRef.current) as AmbientId[]) {
      const p = ambientPlayersRef.current[id];
      if (!p) continue;
      if (id === settings.ambient) continue;
      try {
        p.pause();
      } catch {}
    }
    if (settings.ambient === "off") return;
    const p = ambientPlayersRef.current[settings.ambient];
    if (p && userGestureGrantedRef.current) {
      try {
        p.volume = settings.ambientVolume;
      } catch {}
      safePlay(p);
    }
    // ambientVolume intentionally not in deps — handled by volume effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.ambient, hydrated]);

  // Volume — apply to ALL pre-created players so it always lands on the
  // currently-playing one even if the player ref hasn't been re-read yet.
  useEffect(() => {
    for (const p of Object.values(ambientPlayersRef.current)) {
      if (!p) continue;
      try {
        p.volume = settings.ambientVolume;
      } catch (err) {
        if (__DEV__) console.warn("[audio] ambient volume set failed:", err);
      }
    }
  }, [settings.ambientVolume]);

  // On web, the FIRST user-driven action is the gesture that unlocks
  // audio playback. Once granted, kick off the currently-selected ambient
  // player too (it may have been deferred when the ambient effect ran on
  // hydration).
  const grantUserGestureAndStartAmbient = useCallback(() => {
    if (userGestureGrantedRef.current) return;
    userGestureGrantedRef.current = true;
    if (settings.ambient === "off") return;
    const a = ambientPlayersRef.current[settings.ambient];
    if (a) safePlay(a);
  }, [settings.ambient]);

  // Wrap the ambient setters so that picking a sound (or nudging the volume)
  // counts as the user gesture that unlocks web audio AND triggers playback
  // immediately — even if recitation has never been started. This is what
  // the user expects from "select rain, hear rain".
  const handleAmbientChange = useCallback(
    (id: AmbientId) => {
      grantUserGestureAndStartAmbient();
      // The source effect handles play/pause once the new value lands in
      // state. We just need to make sure the gesture grant has fired by
      // then so the safePlay inside the effect actually runs on web.
      setAmbient(id);
    },
    [grantUserGestureAndStartAmbient, setAmbient],
  );

  const handleAmbientVolumeChange = useCallback(
    (vol: number) => {
      // Tapping a volume bar is itself a user gesture — flip the grant so
      // ambient (which may have been silent because the user hadn't tapped
      // play yet) starts playing now.
      const wasGranted = userGestureGrantedRef.current;
      userGestureGrantedRef.current = true;
      setAmbientVolume(vol);
      if (!wasGranted && settings.ambient !== "off") {
        const a = ambientPlayersRef.current[settings.ambient];
        if (a) safePlay(a);
      }
    },
    [setAmbientVolume, settings.ambient],
  );

  const togglePlay = useCallback(() => {
    pokeControls();
    grantUserGestureAndStartAmbient();
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
  }, [hasFinished, getPlayer, bundle, pokeControls, grantUserGestureAndStartAmbient]);

  const goPrev = useCallback(() => {
    pokeControls();
    grantUserGestureAndStartAmbient();
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
    grantUserGestureAndStartAmbient();
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
    grantUserGestureAndStartAmbient();
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

  // Picker callback — switches surah and/or jumps to a specific ayah, then
  // starts playback (the picker's primary action is "Listen from ayah N",
  // so the user expects audio).
  const handlePickPosition = useCallback(
    (surahNumber: number, ayahNumber: number) => {
      grantUserGestureAndStartAmbient();
      // Stop the currently-playing ayah so we don't bleed audio.
      const oldPlayer = bundle.players[indexRef.current];
      if (oldPlayer) {
        safePause(oldPlayer);
        safeSeekZero(oldPlayer);
      }
      setHasFinished(false);
      setProgress(0);
      const newIndex = ayahNumber - 1;

      if (surahNumber === surah.number) {
        // Same surah: bundle stays, we can play immediately.
        setIndex(newIndex);
        setDisplayedIndex(newIndex);
        const next = getPlayer(newIndex);
        safeSeekZero(next);
        safePlay(next);
        setIsPlaying(true);
        setIsLoading(true);
      } else {
        // Different surah: the bundle is about to be rebuilt by the surah
        // memo. We can't grab a player from the *new* bundle yet — defer
        // playback to the listener effect via the shouldAutoPlay flag.
        shouldAutoPlayRef.current = true;
        setIndex(newIndex);
        setDisplayedIndex(newIndex);
        setIsPlaying(true);
        setIsLoading(true);
      }
      setPosition(surahNumber, ayahNumber);
      setPickerOpen(false);
    },
    [bundle, surah.number, setPosition, getPlayer],
  );

  // Responsive Arabic font size — Mushaf-quality on short ayahs, but
  // gracefully scaled DOWN for very long ones (Al-Baqarah ayah 282 is
  // ~1500 Arabic chars). Combined with the verse ScrollView below, this
  // keeps every ayah readable without overflowing the screen.
  const baseArabicFontSize = useMemo(() => {
    if (width >= 900) return 60;
    if (width >= 700) return 52;
    if (width >= 500) return 44;
    if (width >= 380) return 36;
    return 32;
  }, [width]);

  const computeArabicFontSize = useCallback(
    (charLen: number) => {
      const base = baseArabicFontSize;
      if (charLen > 1000) return Math.max(22, Math.round(base * 0.6));
      if (charLen > 500) return Math.max(24, Math.round(base * 0.7));
      if (charLen > 250) return Math.max(28, Math.round(base * 0.82));
      if (charLen > 120) return Math.max(30, Math.round(base * 0.92));
      return base;
    },
    [baseArabicFontSize],
  );

  // Tighter line-height on long ayahs — the default 1.9× stacks the lines
  // far apart and pushes content off-screen long before the font shrink
  // would help on its own.
  const computeArabicLineHeight = useCallback(
    (fontSize: number, charLen: number) =>
      fontSize * (charLen > 400 ? 1.55 : charLen > 150 ? 1.7 : 1.9),
    [],
  );

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

      {/* === Tap-anywhere layer wraps the chrome + stage. Tap reveals
          the chrome and resets the auto-hide timer. === */}
      <Pressable
        style={styles.pressArea}
        onPress={pokeControls}
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
            <Text
              style={styles.surahArabic}
              allowFontScaling={false}
              numberOfLines={1}
            >
              {surah.nameArabic}
            </Text>
            <TouchableOpacity
              onPress={() => {
                pokeControls();
                grantUserGestureAndStartAmbient();
                setSettingsOpen(true);
              }}
              accessibilityLabel="Settings"
              hitSlop={10}
              style={styles.iconBtn}
              activeOpacity={0.7}
            >
              <Feather name="settings" size={20} color="#d4d4d4" />
            </TouchableOpacity>
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
            const arFs = computeArabicFontSize(a.arabic.length);
            const arLh = computeArabicLineHeight(arFs, a.arabic.length);
            return (
              <Animated.View
                key={`${surah.number}-${a.number}`}
                style={[
                  StyleSheet.absoluteFill,
                  { opacity: bundle.opacities[i] },
                ]}
              >
                {/* ScrollView is always enabled so any verse that
                    overflows the viewport (e.g. Al-Baqarah 282) can be
                    scrolled. The font-scaling logic above still shrinks
                    the longest ayahs, but scrolling is the safety net
                    for screens too small to fit even the scaled font.
                    Tap-to-wake-chrome is preserved by wrapping the
                    content in a Pressable: a clean tap fires the inner
                    onPress, while a drag is escalated to the ScrollView
                    by the responder system. */}
                <ScrollView
                  contentContainerStyle={[
                    styles.verseBox,
                    { paddingVertical: 16 },
                  ]}
                  showsVerticalScrollIndicator={false}
                  bounces={false}
                  scrollEnabled
                  keyboardShouldPersistTaps="always"
                >
                  <Pressable
                    onPress={pokeControls}
                    android_disableSound
                    style={styles.verseInner}
                  >
                    <Text
                      style={[
                        styles.arabic,
                        { fontSize: arFs, lineHeight: arLh },
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
                  </Pressable>
                </ScrollView>
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
        autoplayNextSurah={settings.autoplayNextSurah}
        onTransitionChange={setTransition}
        onBackgroundChange={setBackground}
        onAmbientChange={handleAmbientChange}
        onAmbientVolumeChange={handleAmbientVolumeChange}
        onAutoplayNextSurahChange={setAutoplayNextSurah}
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
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  verseInner: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
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
