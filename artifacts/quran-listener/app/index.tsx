import { SymbolIcon } from "@/components/SymbolIcon";
import { SurahNameGlyph } from "@/components/SurahNameGlyph";
import * as Haptics from "expo-haptics";
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
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { MarqueeText } from "@/components/MarqueeText";
import { ReciterSheet } from "@/components/ReciterSheet";
import { SettingsPanel } from "@/components/SettingsPanel";
import { SleepTimerRing } from "@/components/SleepTimerRing";
import { SurahPicker } from "@/components/SurahPicker";
import { VideoBackground } from "@/components/VideoBackground";
import { AMBIENT_OPTIONS, type AmbientId, getAmbient } from "@/data/ambient";
import { getBackground } from "@/data/backgrounds";
import {
  ayahMarker,
  audioUrlForGlobalAyah,
  getSurah,
  TOTAL_SURAHS,
  validateQuran,
} from "@/data/quran";
import { getReciter, type ReciterId } from "@/data/reciters";
import { getTransition, CROSSFADE_DURATION_MS } from "@/lib/transitions";
import {
  runAudioDiagnostics,
  formatDiagnostics,
} from "@/lib/audioDiagnostic";
import { useMediaSession } from "@/lib/useMediaSession";
import {
  getArabicFont,
  useSettings,
  PLAYBACK_SPEEDS,
  type PlaybackSpeed,
  ARABIC_FONT_SCALES,
  type ArabicFontScale,
} from "@/lib/useSettings";
import { useRecentSurahs } from "@/lib/useRecentSurahs";
import { useBookmarks } from "@/lib/useBookmarks";

// For surahs longer than this, the per-ayah segmented progress row would
// shrink to invisible hairlines. Switch to a single overall progress bar
// + Ayah counter. (Al-Baqarah has 286 ayahs.)
const SEGMENTED_PROGRESS_MAX = 30;

function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

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
    setReciter,
    setPlaybackSpeed,
    setRepeatAyah,
    setAutoplayNextSurah,
    setBackgroundDim,
    setArabicFontScale,
    setPosition,
    setAyah: persistAyah,
  } = useSettings();
  const arabicFontFamily = getArabicFont("uthmani").family;
  const { recentSurahs, recordSurah } = useRecentSurahs();
  const { bookmarks, isBookmarked, toggleBookmark } = useBookmarks();

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
  // Absolute player time tracked alongside `progress` to feed the
  // MediaSession position-state (scrubber in OS media overlay).
  const [playerDurationSec, setPlayerDurationSec] = useState(0);
  const [playerCurrentTimeSec, setPlayerCurrentTimeSec] = useState(0);
  const [hasFinished, setHasFinished] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [audioError, setAudioError] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [reciterSheetOpen, setReciterSheetOpen] = useState(false);
  const [verseMenuVisible, setVerseMenuVisible] = useState(false);
  const menuScale = useRef(new Animated.Value(0.88)).current;
  const [pickerInitialStep, setPickerInitialStep] = useState<
    "surah" | "ayah"
  >("surah");

  // Auto-hide UI chrome (header, ayah counter, footer controls) — like a
  // video player. Tap anywhere to toggle. Only auto-hides while playing.
  const [chromeVisible, setChromeVisible] = useState(true);
  const chromeOpacity = useRef(new Animated.Value(1)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const HIDE_DELAY_MS = 3500;

  // ------------------------------------------------------------------
  // Sleep timer — one-shot session-only timer. The user picks 10 / 20 /
  // 30 / 60 minutes from the settings panel; we capture the absolute
  // wall-clock expiry, gently fade the recitation + ambient player
  // volumes to zero in the final ~4 seconds, then pause everything and
  // restore the base volumes so the next playback is at full level.
  // ------------------------------------------------------------------
  const [sleepExpiresAt, setSleepExpiresAt] = useState<number | null>(null);
  const [sleepRemainingMs, setSleepRemainingMs] = useState<number>(0);
  const [sleepDurationMin, setSleepDurationMin] = useState<number | null>(null);

  const indexRef = useRef(index);
  const isPlayingRef = useRef(isPlaying);
  const settingsOpenRef = useRef(settingsOpen);
  const pickerOpenRef = useRef(pickerOpen);
  // Mirrors settings.autoplayNextSurah for the audio listener closure,
  // which is set up once per (surah, index) and otherwise wouldn't see
  // settings changes between attaches.
  const autoplayNextSurahRef = useRef(settings.autoplayNextSurah);
  // Same pattern for repeatAyah — lets handleDidFinish read the live
  // value without the audio effect taking it as a dependency.
  const repeatAyahRef = useRef(settings.repeatAyah);
  // Stable ref to recordSurah so the audio effect closure can call it without
  // being re-run every time recentSurahs changes.
  const recordSurahRef = useRef(recordSurah);
  recordSurahRef.current = recordSurah;
  // Set to true (meaning "was playing") when the user switches reciter while
  // audio is playing, so the audio effect knows to auto-resume on the new player.
  const reciterChangedRef = useRef(false);
  // Always points to the AudioPlayer for the current ayah. The sleep timer
  // reads this ref rather than bundle.players so it still fades/pauses the
  // correct player even after a bundle rebuild caused by a reciter switch.
  const currentRecitationPlayerRef = useRef<AudioPlayer | null>(null);
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
  useEffect(() => {
    repeatAyahRef.current = settings.repeatAyah;
  }, [settings.repeatAyah]);
  useEffect(() => {
    if (verseMenuVisible) {
      menuScale.setValue(0.88);
      Animated.spring(menuScale, {
        toValue: 1,
        useNativeDriver: true,
        damping: 20,
        stiffness: 300,
        mass: 0.8,
      }).start();
    }
  }, [verseMenuVisible, menuScale]);

  // Dev-only: expose runAudioDiagnostics to the browser console so it can be
  // invoked at any time with `window.__audioDiag()` without instrumenting prod
  // code. The snapshot is captured fresh on every call so it always reflects
  // the live state. Also auto-runs after each play/pause toggle and logs any
  // failures so regressions surface immediately in the browser console.
  useEffect(() => {
    if (!__DEV__ || Platform.OS !== "web") return;
    const snap = () => {
      const player = currentRecitationPlayerRef.current;
      return runAudioDiagnostics({
        isPlaying,
        hasFinished,
        isLoading,
        audioError,
        repeatAyah: settings.repeatAyah,
        index,
        ayahCount: ayahs.length,
        playerLoaded: player?.isLoaded ?? false,
        playerPlaying:
          (player as unknown as { playing?: boolean })?.playing ?? false,
        playerDuration: player?.duration ?? 0,
        playerCurrentTime: player?.currentTime ?? 0,
        playbackSpeed: settings.playbackSpeed,
        reciterId: settings.reciterId,
      });
    };
    // Expose to console: window.__audioDiag()
    (window as unknown as Record<string, unknown>).__audioDiag = () => {
      const results = snap();
      // eslint-disable-next-line no-console
      console.log(formatDiagnostics(results));
      return results;
    };
    // Auto-run and surface failures only (no-op when everything passes).
    const results = snap();
    const failures = results.filter((r) => !r.passed);
    if (failures.length) {
      // eslint-disable-next-line no-console
      console.warn(
        `[audio] ${failures.length} diagnostic failure(s):\n` +
          failures
            .map(
              (f) =>
                `  ✗ [${f.id}] ${f.description}${f.note ? ` — ${f.note}` : ""}`,
            )
            .join("\n"),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, hasFinished, isLoading, audioError]);

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

  // Tap on the empty stage / verse area: TOGGLE the chrome. This is what
  // the user expects from a video-player-style overlay — tap once to
  // reveal, tap again to hide. Distinct from `pokeControls`, which is
  // called from the controls themselves (play / next / picker / …) and
  // must always show, never hide, so the user sees feedback.
  const tapBackground = useCallback(() => {
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
    // We key the bundle on both surah.number and reciterId. Changing either
    // tears down all existing players and creates a fresh set with the
    // correct audio URLs. settings.ayah must NOT be in deps — a position
    // change within the same surah/reciter must not rebuild players.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surah.number, settings.reciterId]);

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

  // Keep a ref to the current speed so getPlayer can read it without taking
  // settings.playbackSpeed as a dependency. If playbackSpeed were in getPlayer's
  // deps, every speed change would rebuild getPlayer → re-run the audio
  // listener effect → disrupt playback mid-ayah.
  const playbackSpeedRef = useRef<PlaybackSpeed>(settings.playbackSpeed);
  playbackSpeedRef.current = settings.playbackSpeed;

  // Apply playback rate to a player cross-platform.
  // expo-audio's web implementation (AudioPlayerWeb) exposes `playbackRate`
  // (mirroring HTMLAudioElement.playbackRate) and `setPlaybackRate()`.
  // It does NOT have a `rate` property — setting `p.rate` is a silent no-op
  // on web, which is why speed changes appeared to do nothing.
  // On native, AudioPlayer exposes `rate` and `shouldCorrectPitch`.
  // We try both paths so this works correctly on every platform.
  const applyRateToPlayer = (p: AudioPlayer, speed: PlaybackSpeed) => {
    try {
      // Web path: AudioPlayerWeb.playbackRate → media.playbackRate
      if (typeof (p as unknown as { playbackRate?: unknown }).playbackRate === "number" ||
          typeof (p as unknown as { setPlaybackRate?: unknown }).setPlaybackRate === "function") {
        (p as unknown as { playbackRate: number }).playbackRate = speed;
        // Also set preservesPitch via the web API if available
        const media = (p as unknown as { media?: HTMLAudioElement }).media;
        if (media) {
          try { media.preservesPitch = true; } catch {}
        }
      }
      // Native path: AudioPlayer.rate + shouldCorrectPitch
      (p as unknown as { rate: number }).rate = speed;
      (p as unknown as { shouldCorrectPitch: boolean }).shouldCorrectPitch = true;
    } catch {}
  };

  const getPlayer = useCallback(
    (i: number): AudioPlayer => {
      let p = bundle.players[i];
      if (!p) {
        p = createAudioPlayer({
          uri: audioUrlForGlobalAyah(
            ayahs[i].globalNumber,
            getReciter(settings.reciterId).cdnIdentifier,
          ),
        });
        // Apply the current playback rate immediately via ref so the player
        // is ready at the right speed the moment audio starts — without
        // making getPlayer depend on settings.playbackSpeed.
        applyRateToPlayer(p, playbackSpeedRef.current);
        bundle.players[i] = p;
      }
      return p;
    },
    // playbackSpeedRef is intentionally omitted — it's a ref (stable object),
    // and we read .current at call time. Only bundle/ayahs/reciterId should
    // trigger a new getPlayer reference.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bundle, ayahs, settings.reciterId],
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

  // Sleep timer tick — runs only while a timer is active. Updates the
  // displayed countdown every 250 ms; smoothly fades all audio in the
  // final 4 s; pauses everything and clears itself on expiry. Cleanup
  // restores the base volumes if the user cancels mid-fade so audio
  // resumes at full level next time.
  useEffect(() => {
    if (sleepExpiresAt == null) {
      setSleepRemainingMs(0);
      return;
    }

    const FADE_MS = 4000;
    const baseAmbient = settings.ambientVolume;
    let cancelled = false;

    const applyVolume = (factor: number) => {
      // Use the ref so we always reach the live player even after a
      // bundle rebuild caused by a reciter switch mid-session.
      const recit = currentRecitationPlayerRef.current;
      if (recit) {
        try {
          recit.volume = factor;
        } catch {}
      }
      if (settings.ambient !== "off") {
        const a = ambientPlayersRef.current[settings.ambient];
        if (a) {
          try {
            a.volume = baseAmbient * factor;
          } catch {}
        }
      }
    };

    const tick = () => {
      if (cancelled) return;
      const now = Date.now();
      const remaining = sleepExpiresAt - now;
      if (remaining <= 0) {
        const recit = currentRecitationPlayerRef.current;
        if (recit) safePause(recit);
        if (settings.ambient !== "off") {
          const a = ambientPlayersRef.current[settings.ambient];
          if (a) safePause(a);
        }
        applyVolume(1);
        setIsPlaying(false);
        setSleepRemainingMs(0);
        setSleepExpiresAt(null);
        setSleepDurationMin(null);
        return;
      }
      if (remaining <= FADE_MS) {
        applyVolume(Math.max(0, remaining / FADE_MS));
      }
      setSleepRemainingMs(remaining);
    };

    // Run once immediately so the chip shows the correct time, then poll.
    tick();
    const id = setInterval(tick, 250);

    return () => {
      cancelled = true;
      clearInterval(id);
      // Restore base volumes if the timer was cancelled mid-fade.
      applyVolume(1);
    };
    // We intentionally leave bundle/ambient out of deps — the tick reads
    // them via refs/closure on each fire and re-running this effect would
    // reset the fade. The deps that *do* matter are the timer expiry and
    // the chosen ambient + base volume so a fresh fade uses correct values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sleepExpiresAt, settings.ambient, settings.ambientVolume]);

  const setSleepTimerMinutes = useCallback((minutes: number | null) => {
    if (minutes == null) {
      setSleepExpiresAt(null);
      setSleepDurationMin(null);
      return;
    }
    setSleepDurationMin(minutes);
    setSleepExpiresAt(Date.now() + minutes * 60_000);
  }, []);

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

  // Audio status subscription — re-attaches whenever index, surah, or
  // reciter changes (getPlayer changes when any of those change).
  useEffect(() => {
    const player = getPlayer(index);
    // Track the live player so the sleep timer always fades/pauses the
    // correct player even after a bundle rebuild from a reciter switch.
    currentRecitationPlayerRef.current = player;
    setProgress(0);
    setAudioError(false);

    // If this player is already loaded (pre-buffered by the look-ahead in
    // a previous effect run), skip the loading spinner entirely. Showing it
    // unconditionally caused a false "loading" flash on every rapid skip
    // because pre-buffered players emit their first status immediately.
    setIsLoading(!player.isLoaded);

    // ---------------------------------------------------------------
    // Shared "track finished" logic — used by both the status listener
    // and the web ended-poll below so they stay perfectly in sync.
    // ---------------------------------------------------------------
    const handleDidFinish = () => {
      const cur = indexRef.current;

      // Repeat mode: loop the current ayah indefinitely. Seek back to 0
      // and replay without touching the index or advancing the surah.
      if (repeatAyahRef.current && isPlayingRef.current) {
        safeSeekZero(player);
        applyRateToPlayer(player, playbackSpeedRef.current);
        safePlay(player);
        return;
      }

      if (cur < ayahs.length - 1) {
        safePause(player);
        safeSeekZero(player);
        const next = getPlayer(cur + 1);
        if (isPlayingRef.current) {
          safePlay(next);
        }
        // Update the ref synchronously so the web ended-poll — which checks
        // indexRef.current !== index before calling handleDidFinish — sees
        // the new index immediately and cannot double-fire within the same
        // 200 ms interval before the React state update propagates.
        indexRef.current = cur + 1;
        setIndex(cur + 1);
      } else {
        // End of surah.
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
          // Reset index BEFORE the settings update so when the new
          // bundle mounts (ayah 1) the index already aligns.
          setIndex(0);
          setDisplayedIndex(0);
          setPosition(surah.number + 1, 1);
          recordSurahRef.current(surah.number + 1);
        } else {
          setIsPlaying(false);
          setHasFinished(true);
          setProgress(100);
        }
      }
    };

    // ---------------------------------------------------------------
    // Load-failure safety net. expo-audio's web implementation has no
    // onerror handler, so a 4xx/5xx response or network failure never
    // emits a status event. Without this timeout the spinner runs
    // forever. After 12 s we surface the error icon instead.
    // Only start the timeout if the player isn't already loaded — rapid
    // skips to pre-buffered players must not arm a fresh 12 s countdown.
    // ---------------------------------------------------------------
    let loadTimeoutId: ReturnType<typeof setTimeout> | null = player.isLoaded
      ? null
      : setTimeout(() => {
          loadTimeoutId = null;
          if (!player.isLoaded) {
            setIsLoading(false);
            setAudioError(true);
          }
        }, 12_000);

    // Stall-recovery flag: set to true on the first loaded event so the
    // auto-resume below fires at most once per effect mount. This mirrors
    // AVPlayer's automatic stall recovery — if the skip handlers called
    // play() before the audio was ready (rejected by the browser), this
    // retries once the media reports ready-to-play.
    let hasTriedAutoResume = false;

    const sub = player.addListener(
      "playbackStatusUpdate",
      (status: AudioStatus) => {
        if (indexRef.current !== index) return;
        if (!status.isLoaded) {
          setIsLoading(true);
          return;
        }
        // First loaded event — cancel the error timeout.
        if (loadTimeoutId) {
          clearTimeout(loadTimeoutId);
          loadTimeoutId = null;
        }
        setAudioError(false);
        setIsLoading(!!status.isBuffering);

        // Stall recovery: if the user intended to play but the player
        // isn't running (play() was called before load completed and the
        // browser rejected/aborted it), resume now that it's ready.
        // Only fires once per effect mount to avoid looping on hard errors.
        if (
          !hasTriedAutoResume &&
          isPlayingRef.current &&
          !player.playing &&
          !status.isBuffering &&
          !status.didJustFinish
        ) {
          hasTriedAutoResume = true;
          applyRateToPlayer(player, playbackSpeedRef.current);
          safePlay(player);
        }

        const dur = status.duration ?? 0;
        if (dur > 0) {
          setProgress(Math.min(100, (status.currentTime / dur) * 100));
          setPlayerDurationSec(dur);
          setPlayerCurrentTimeSec(status.currentTime);
        } else {
          setProgress(0);
        }

        if (status.didJustFinish) {
          handleDidFinish();
        }
      },
    );

    // Pre-create the next player so it can buffer ahead.
    if (index < ayahs.length - 1) {
      getPlayer(index + 1);
    }

    // ---------------------------------------------------------------
    // Auto-play decisions (three cases):
    //   1. Cross-surah picker jump (shouldAutoPlayRef) — always play.
    //   2. Reciter switch while playing (reciterChangedRef) — resume.
    //   3. Normal ayah skip — the skip handler already called safePlay
    //      before setIndex, so no action needed here (stall-recovery
    //      in the status listener handles the case where play() was
    //      called before the player was ready).
    // ---------------------------------------------------------------
    if (shouldAutoPlayRef.current) {
      shouldAutoPlayRef.current = false;
      safeSeekZero(player);
      applyRateToPlayer(player, playbackSpeedRef.current);
      safePlay(player);
      setIsPlaying(true);
    } else if (reciterChangedRef.current) {
      reciterChangedRef.current = false;
      safeSeekZero(player);
      applyRateToPlayer(player, playbackSpeedRef.current);
      safePlay(player);
    }

    // ---------------------------------------------------------------
    // Web ended-poll. expo-audio's AudioPlayerWeb.onended only resets
    // lastEmitTime to 0 but never emits a playbackStatusUpdate. The
    // subsequent ontimeupdate events also stop after the media ends, so
    // didJustFinish is never seen by the listener above. Poll every
    // 200 ms as a fallback so ayah auto-advance works on web.
    // ---------------------------------------------------------------
    let endedPollId: ReturnType<typeof setInterval> | null = null;
    if (Platform.OS === "web") {
      endedPollId = setInterval(() => {
        if (indexRef.current !== index) {
          clearInterval(endedPollId!);
          endedPollId = null;
          return;
        }
        if (!isPlayingRef.current) return;
        const dur = player.duration;
        const cur = player.currentTime;
        // Detect: loaded, previously playing, now stopped, at/near end.
        if (dur > 0 && cur > 0 && !player.playing && cur >= dur - 0.5) {
          clearInterval(endedPollId!);
          endedPollId = null;
          handleDidFinish();
        }
      }, 200);
    }

    return () => {
      sub.remove();
      if (loadTimeoutId) clearTimeout(loadTimeoutId);
      if (endedPollId) clearInterval(endedPollId);
    };
    // surah.number and setPosition are accessed from closure; they are
    // always in sync because getPlayer changes whenever the bundle
    // (keyed on surah.number + reciterId) changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

    if (transition.id === "crossfade") {
      const outIdx = displayedIndex;
      const inIdx = index;

      // Guard: on first mount (or bundle rebuild) they may already match.
      if (outIdx === inIdx) {
        stageOpacity.setValue(1);
        bundle.opacities.forEach((v, i) => v.setValue(i === inIdx ? 1 : 0));
        setDisplayedIndex(inIdx);
        return;
      }

      // Ensure only the outgoing verse is visible before we start.
      stageOpacity.setValue(1);
      bundle.opacities.forEach((v, i) => {
        if (i !== outIdx) v.setValue(0);
      });

      // Leg 1 — fade the outgoing verse to 0.
      Animated.timing(bundle.opacities[outIdx], {
        toValue: 0,
        duration: CROSSFADE_DURATION_MS,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (!finished) return; // interrupted by a faster skip — let that run
        // Leg 2 — make all verses invisible, then fade in the incoming one.
        // `displayedIndex` must be updated before the opacity animation so
        // the verse view is mounted in the render tree (it renders only when
        // `i === displayedIndex || i === index`).
        bundle.opacities.forEach((v) => v.setValue(0));
        setDisplayedIndex(inIdx);
        Animated.timing(bundle.opacities[inIdx], {
          toValue: 1,
          duration: CROSSFADE_DURATION_MS,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }).start();
      });
    } else {
      // Instant — snap with no animation at all.
      stageOpacity.setValue(1);
      bundle.opacities.forEach((v, i) => v.setValue(i === index ? 1 : 0));
      setDisplayedIndex(index);
    }

    return () => {
      if (transitionTimer.current) {
        clearTimeout(transitionTimer.current);
        transitionTimer.current = null;
      }
    };
    // displayedIndex is intentionally omitted — it is captured from the
    // closure at the time index changes (the value we want to fade OUT).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, surah.number, bundle, transition.id, stageOpacity]);

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

  // When the user changes playback speed, apply the new rate to ALL existing
  // players in the current bundle so any pre-buffered players also get the
  // correct rate. New players are also initialized inside getPlayer().
  useEffect(() => {
    for (const p of bundle.players) {
      if (p) applyRateToPlayer(p, settings.playbackSpeed);
    }
    // Also cover the current player via ref in case bundle hasn't updated yet.
    const cur = currentRecitationPlayerRef.current;
    if (cur) applyRateToPlayer(cur, settings.playbackSpeed);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.playbackSpeed]);

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

  // Reciter change handler. Captures whether audio is currently playing so
  // the audio effect (which runs after the bundle rebuilds) can auto-resume
  // on the fresh player without requiring a manual tap.
  const handleReciterChange = useCallback(
    (id: ReciterId) => {
      // Pause the current player IMMEDIATELY so the outgoing reciter goes
      // silent before the new bundle is even constructed. Without this,
      // the old AudioPlayer can bleed audio until React commits the new
      // bundle and the teardown effect runs.
      const current = currentRecitationPlayerRef.current;
      if (current) safePause(current);
      reciterChangedRef.current = isPlayingRef.current;
      setAudioError(false);
      setReciter(id);
    },
    [setReciter],
  );


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
      setAudioError(false);
      for (const p of bundle.players) {
        if (p) safeSeekZero(p);
      }
      const first = getPlayer(0);
      applyRateToPlayer(first, playbackSpeedRef.current);
      safePlay(first);
      setIndex(0);
      setIsPlaying(true);
      setProgress(0);
      return;
    }
    const cur = indexRef.current;
    // If the player is in an error state, tear it down and let getPlayer
    // rebuild it fresh — same pattern Apple uses when AVPlayer fails:
    // discard the broken asset, create a new AVPlayerItem, and replay.
    if (audioError) {
      const broken = bundle.players[cur];
      if (broken) {
        try { broken.remove(); } catch {}
        bundle.players[cur] = null;
      }
      setAudioError(false);
      setIsLoading(true);
      // getPlayer now creates a fresh player for this index.
      const fresh = getPlayer(cur);
      applyRateToPlayer(fresh, playbackSpeedRef.current);
      safePlay(fresh);
      setIsPlaying(true);
      return;
    }
    const player = getPlayer(cur);
    // Use isPlayingRef (React intent) rather than player.playing (hardware
    // state) to decide direction. player.playing can transiently be false
    // while buffering, which would otherwise flip a play→pause tap into a
    // play→play no-op and leave the spinner running.
    if (isPlayingRef.current) {
      // Synchronously update the ref so the stall-recovery path in the
      // status listener sees the correct intent before the next render.
      isPlayingRef.current = false;
      safePause(player);
      setIsPlaying(false);
    } else {
      setAudioError(false);
      setIsLoading(!player.isLoaded);
      applyRateToPlayer(player, playbackSpeedRef.current);
      safePlay(player);
      setIsPlaying(true);
    }
  }, [hasFinished, audioError, getPlayer, bundle, pokeControls, grantUserGestureAndStartAmbient]);

  // ------------------------------------------------------------------
  // Skip throttle. Rapid taps on next / previous used to leave the
  // player in a desynced state (paused player, isPlaying still true,
  // controls dead) because each tap fired a fresh pause/seek/play
  // sequence on top of the previous tap that hadn't yet finished. Two
  // defenses:
  //   1. `skipLockRef` ignores any tap that lands within
  //      SKIP_COOLDOWN_MS of the previous one — single taps still feel
  //      instant, but a frantic burst is collapsed to one transition.
  //   2. `indexRef.current` is updated synchronously so the *next*
  //      allowed tap reads the post-skip index instead of the stale
  //      pre-skip one (otherwise consecutive valid taps would both
  //      compute their target from the original index).
  // ------------------------------------------------------------------
  const SKIP_COOLDOWN_MS = 350;
  const skipLockRef = useRef(false);
  const skipUnlockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lockSkip = useCallback(() => {
    skipLockRef.current = true;
    if (skipUnlockTimer.current) clearTimeout(skipUnlockTimer.current);
    skipUnlockTimer.current = setTimeout(() => {
      skipLockRef.current = false;
      skipUnlockTimer.current = null;
    }, SKIP_COOLDOWN_MS);
  }, []);
  useEffect(() => {
    return () => {
      if (skipUnlockTimer.current) clearTimeout(skipUnlockTimer.current);
    };
  }, []);

  const goPrev = useCallback(() => {
    if (skipLockRef.current) return;
    pokeControls();
    grantUserGestureAndStartAmbient();
    const cur = indexRef.current;
    if (cur > 0) {
      lockSkip();
      setHasFinished(false);
      const wasPlaying = isPlayingRef.current;
      const old = bundle.players[cur];
      if (old) {
        safePause(old);
        safeSeekZero(old);
      }
      const prev = getPlayer(cur - 1);
      safeSeekZero(prev);
      if (wasPlaying) {
        applyRateToPlayer(prev, playbackSpeedRef.current);
        safePlay(prev);
        // Keep React state in lockstep with the player we just kicked
        // off — a rapid pause/play sequence on the previous player can
        // briefly emit playing=false on the listener and otherwise leak
        // into the visible play/pause icon.
        setIsPlaying(true);
      }
      indexRef.current = cur - 1;
      setIndex(cur - 1);
    } else {
      const player = getPlayer(0);
      safeSeekZero(player);
    }
  }, [getPlayer, bundle, pokeControls, lockSkip]);

  const goNext = useCallback(() => {
    if (skipLockRef.current) return;
    pokeControls();
    grantUserGestureAndStartAmbient();
    const cur = indexRef.current;
    if (cur < ayahs.length - 1) {
      lockSkip();
      setHasFinished(false);
      const wasPlaying = isPlayingRef.current;
      const old = bundle.players[cur];
      if (old) {
        safePause(old);
        safeSeekZero(old);
      }
      const next = getPlayer(cur + 1);
      safeSeekZero(next);
      if (wasPlaying) {
        applyRateToPlayer(next, playbackSpeedRef.current);
        safePlay(next);
        setIsPlaying(true);
      }
      indexRef.current = cur + 1;
      setIndex(cur + 1);
    }
  }, [getPlayer, bundle, ayahs.length, pokeControls, lockSkip]);

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
      recordSurah(surahNumber);
      setPickerOpen(false);
    },
    [bundle, surah.number, setPosition, getPlayer, recordSurah],
  );

  // MediaSession play/pause wrappers — the API calls play() and pause()
  // independently (not as a toggle). Both are thin guards over togglePlay
  // which now drives direction from isPlayingRef, so they are safe to
  // call even if state is momentarily stale.
  const mediaSessionPlay = useCallback(() => {
    if (!isPlayingRef.current) togglePlay();
  }, [togglePlay]);
  const mediaSessionPause = useCallback(() => {
    if (isPlayingRef.current) togglePlay();
  }, [togglePlay]);

  // Hook — updates OS / browser "Now Playing" widget with each ayah.
  // Passing Arabic text as `title` means the system widget (macOS menu-bar,
  // Chrome media overlay, Android lock screen) shows the ayah in the system
  // Arabic font. It cannot use the custom Uthmanic typeface, but the Unicode
  // characters render correctly and readably.
  useMediaSession({
    isPlaying,
    arabicText: ayahs[index].arabic,
    translation: ayahs[index].translation,
    surahNameLatin: surah.nameLatin,
    surahMeaning: surah.meaning,
    ayahNumber: ayahs[index].number,
    ayahCount: ayahs.length,
    reciterName: getReciter(settings.reciterId).name,
    playbackSpeed: settings.playbackSpeed,
    playerDuration: playerDurationSec,
    playerCurrentTime: playerCurrentTimeSec,
    onPlay: mediaSessionPlay,
    onPause: mediaSessionPause,
    onPrev: goPrev,
    onNext: goNext,
  });

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
      const base = Math.round(baseArabicFontSize * settings.arabicFontScale);
      if (charLen > 1000) return Math.max(18, Math.round(base * 0.6));
      if (charLen > 500) return Math.max(20, Math.round(base * 0.7));
      if (charLen > 250) return Math.max(22, Math.round(base * 0.82));
      if (charLen > 120) return Math.max(24, Math.round(base * 0.92));
      return base;
    },
    [baseArabicFontSize, settings.arabicFontScale],
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

  const hasBg = !!activeBgOpt.source || !!activeBgOpt.videoUrl;

  // When a background is active the secondary-label grey (#8e8e93) can
  // disappear into the dimmed video frame.  Lightening it slightly when a
  // background is shown keeps the contrast ratio above Apple's 4.5:1
  // recommendation for secondary text on dark surfaces. Combined with the
  // text-shadow on every secondary style, this covers both dim-on and
  // dim-off states across all five video backgrounds.
  const secondaryOverride = hasBg
    ? ({ color: settings.backgroundDim ? "#b0b0b8" : "#aeaeb2" } as const)
    : undefined;

  // Overall progress across the whole surah (only used for long surahs that
  // fall back to a single progress bar).
  const overallProgress =
    ((index + Math.min(progress, 100) / 100) / Math.max(1, ayahs.length)) * 100;

  return (
    <View style={styles.root}>
      {/* === Background layer (static image OR live video) === */}
      <Animated.View
        style={[StyleSheet.absoluteFill, { opacity: bgFade }]}
        pointerEvents="none"
      >
        {activeBgOpt.videoUrl ? (
          <VideoBackground url={activeBgOpt.videoUrl} />
        ) : hasBg && activeBgOpt.source ? (
          <Image
            source={activeBgOpt.source}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={0}
          />
        ) : null}
        <LinearGradient
          colors={
            hasBg
              ? settings.backgroundDim
                ? [
                    "rgba(0,0,0,0.55)",
                    "rgba(0,0,0,0.35)",
                    "rgba(0,0,0,0.55)",
                    "rgba(0,0,0,0.85)",
                  ]
                : // Dim disabled — let the image shine through. We keep
                  // a faint bottom vignette so the footer controls and
                  // reciter label remain legible against bright skies.
                  [
                    "rgba(0,0,0,0)",
                    "rgba(0,0,0,0)",
                    "rgba(0,0,0,0)",
                    "rgba(0,0,0,0.55)",
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
        onPress={tapBackground}
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
            <Text style={[styles.eyebrow, secondaryOverride]}>Surah {surah.number}</Text>
            <View style={styles.headerLeftTitleRow}>
              <Text style={styles.surahLabel} numberOfLines={1}>
                {surah.nameLatin}{" "}
                <Text style={[styles.surahMeaning, secondaryOverride]}>— {surah.meaning}</Text>
              </Text>
              <SymbolIcon
                name="chevron.down"
                fallbackIonicon="chevron-down"
                size={14}
                color="#737373"
                style={styles.chev}
              />
            </View>
          </TouchableOpacity>
          <View style={styles.headerRight}>
            <SurahNameGlyph
              surah={surah}
              size={28}
              color="#f5f5f5"
              style={styles.surahArabicGlyph}
            />
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
              <SymbolIcon name="gearshape" fallbackIonicon="settings-outline" size={20} color="#d4d4d4" />
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
            <Text style={[styles.counter, secondaryOverride]}>
              Ayah {ayahs[index].number} of {ayahs.length}
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
              <AyahView
                key={`${surah.number}-${a.number}`}
                ayah={a}
                opacity={bundle.opacities[i]}
                arabicFontFamily={arabicFontFamily}
                arFs={arFs}
                arLh={arLh}
                translationFontSize={translationFontSize}
                onTap={tapBackground}
                onLongPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  setVerseMenuVisible(true);
                }}
              />
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
                  <View
                    key={a.number}
                    style={styles.progressTrack}
                  >
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
            <TouchableOpacity
              style={styles.reciterCol}
              onPress={() => {
                pokeControls();
                setReciterSheetOpen(true);
              }}
              activeOpacity={0.7}
              accessibilityLabel={`Reciter: ${getReciter(settings.reciterId).name}. Tap to change.`}
              hitSlop={6}
            >
              <View style={styles.reciterEyebrowRow}>
                <Text style={[styles.reciterEyebrow, secondaryOverride]}>Reciter</Text>
              </View>
              <View style={styles.reciterNameRow}>
                <MarqueeText style={styles.reciterName}>
                  {getReciter(settings.reciterId).name}
                </MarqueeText>
                <SymbolIcon
                  name="chevron.up"
                  fallbackIonicon="chevron-up"
                  size={10}
                  color="#737373"
                  style={styles.reciterChevron}
                />
              </View>
            </TouchableOpacity>

            <View style={styles.controlsCenter}>
              <TouchableOpacity
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  goPrev();
                }}
                accessibilityLabel="Previous ayah"
                disabled={index === 0 && progress < 1}
                hitSlop={10}
                style={[
                  styles.iconBtn,
                  { opacity: index === 0 && progress < 1 ? 0.3 : 1 },
                ]}
                activeOpacity={0.7}
              >
                <SymbolIcon
                  name="backward.end.fill"
                  fallbackIonicon="play-skip-back"
                  size={22}
                  color="#d4d4d4"
                />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  togglePlay();
                }}
                accessibilityLabel={isPlaying ? "Pause" : "Play"}
                activeOpacity={0.85}
                style={styles.playBtn}
              >
                {isLoading && isPlaying && !audioError ? (
                  <ActivityIndicator color="#000" size="small" />
                ) : audioError ? (
                  <SymbolIcon
                    name="exclamationmark.triangle.fill"
                    fallbackIonicon="warning"
                    size={24}
                    color="#c0392b"
                  />
                ) : (
                  <SymbolIcon
                    name={
                      hasFinished
                        ? "arrow.counterclockwise"
                        : isPlaying
                          ? "pause.fill"
                          : "play.fill"
                    }
                    fallbackIonicon={
                      hasFinished
                        ? "refresh"
                        : isPlaying
                          ? "pause"
                          : "play"
                    }
                    size={26}
                    color="#000"
                    style={
                      !hasFinished && !isPlaying
                        ? { marginLeft: 2 }
                        : undefined
                    }
                  />
                )}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  goNext();
                }}
                accessibilityLabel="Next ayah"
                disabled={index === ayahs.length - 1}
                hitSlop={10}
                style={[
                  styles.iconBtn,
                  { opacity: index === ayahs.length - 1 ? 0.3 : 1 },
                ]}
                activeOpacity={0.7}
              >
                <SymbolIcon
                  name="forward.end.fill"
                  fallbackIonicon="play-skip-forward"
                  size={22}
                  color="#d4d4d4"
                />
              </TouchableOpacity>
            </View>

            <View style={styles.restartCol}>
              {sleepExpiresAt != null && sleepDurationMin != null ? (
                <SleepTimerRing
                  remainingMs={sleepRemainingMs}
                  durationMin={sleepDurationMin}
                  onCancel={() => setSleepTimerMinutes(null)}
                />
              ) : (
                <TouchableOpacity
                  onPress={restart}
                  hitSlop={8}
                  activeOpacity={0.6}
                >
                  <SymbolIcon
                    name="arrow.counterclockwise"
                    fallbackIonicon="refresh"
                    size={20}
                    color="#8e8e93"
                  />
                </TouchableOpacity>
              )}
            </View>
          </View>
        </Animated.View>
      </Pressable>


      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        transition={settings.transition}
        background={settings.background}
        ambient={settings.ambient}
        ambientVolume={settings.ambientVolume}
        autoplayNextSurah={settings.autoplayNextSurah}
        backgroundDim={settings.backgroundDim}
        sleepTimerMinutes={sleepDurationMin}
        onTransitionChange={setTransition}
        onBackgroundChange={setBackground}
        onAmbientChange={handleAmbientChange}
        onAmbientVolumeChange={handleAmbientVolumeChange}
        arabicFontScale={settings.arabicFontScale}
        onArabicFontScaleChange={setArabicFontScale}
        onAutoplayNextSurahChange={setAutoplayNextSurah}
        onBackgroundDimChange={setBackgroundDim}
        onSleepTimerChange={setSleepTimerMinutes}
      />

      <SurahPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        currentSurah={surah.number}
        currentAyah={index + 1}
        onSelect={handlePickPosition}
        initialStep={pickerInitialStep}
        recentSurahs={recentSurahs}
        bookmarks={bookmarks}
        onSelectBookmark={(s, a) => {
          handlePickPosition(s, a);
        }}
      />

      <ReciterSheet
        open={reciterSheetOpen}
        onClose={() => setReciterSheetOpen(false)}
        reciterId={settings.reciterId}
        onReciterChange={handleReciterChange}
        playbackSpeed={settings.playbackSpeed}
        onPlaybackSpeedChange={setPlaybackSpeed}
      />

      {/* ── Verse context menu (long-press) — Apple UIContextMenu style ─── */}
      <Modal
        visible={verseMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setVerseMenuVisible(false)}
        statusBarTranslucent
      >
        {/* Full-screen dim + blur overlay — tap outside to dismiss */}
        <Pressable
          style={[
            styles.ctxOverlay,
            Platform.OS === "web"
              ? ({ backdropFilter: "blur(20px)" } as object)
              : {},
          ]}
          onPress={() => setVerseMenuVisible(false)}
        >
          {/* Spring-animated container — stops taps propagating to overlay */}
          <Animated.View
            style={[styles.ctxContainer, { transform: [{ scale: menuScale }] }]}
          >
            {/* ① Preview card — verse "lifted" from the page */}
            <Pressable style={styles.ctxPreview} onPress={() => {}}>
              <Text
                style={[
                  styles.ctxPreviewArabic,
                  { fontFamily: arabicFontFamily },
                ]}
                numberOfLines={3}
              >
                {ayahs[index].arabic}
              </Text>
              <Text style={styles.ctxPreviewMeta}>
                {surah.name}{"  ·  "}Ayah {ayahs[index].number}
              </Text>
            </Pressable>

            {/* 8 pt gap between preview and menu — exact Apple spacing */}
            <View style={{ height: 8 }} />

            {/* ② Menu card — frosted glass panel */}
            <Pressable
              style={[
                styles.ctxMenu,
                Platform.OS === "web"
                  ? ({ backdropFilter: "blur(40px)" } as object)
                  : {},
              ]}
              onPress={() => {}}
            >
              {/* Bookmark */}
              <TouchableOpacity
                style={styles.ctxRow}
                activeOpacity={0.5}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  toggleBookmark(surah.number, ayahs[index].number);
                  setVerseMenuVisible(false);
                }}
              >
                <Text style={styles.ctxRowLabel}>
                  {isBookmarked(surah.number, ayahs[index].number)
                    ? "Remove Bookmark"
                    : "Bookmark"}
                </Text>
                <SymbolIcon
                  name={
                    isBookmarked(surah.number, ayahs[index].number)
                      ? "bookmark.fill"
                      : "bookmark"
                  }
                  fallbackIonicon={
                    isBookmarked(surah.number, ayahs[index].number)
                      ? "bookmark"
                      : "bookmark-outline"
                  }
                  size={18}
                  color={
                    isBookmarked(surah.number, ayahs[index].number)
                      ? "#e8c078"
                      : "rgba(235,235,245,0.6)"
                  }
                />
              </TouchableOpacity>

              <View style={styles.ctxSep} />

              {/* Repeat Ayah */}
              <TouchableOpacity
                style={styles.ctxRow}
                activeOpacity={0.5}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setRepeatAyah(!settings.repeatAyah);
                  setVerseMenuVisible(false);
                }}
              >
                <Text style={styles.ctxRowLabel}>
                  {settings.repeatAyah ? "Stop Repeating" : "Repeat Ayah"}
                </Text>
                <Text style={styles.ctxRowIcon}>
                  {settings.repeatAyah ? "✓" : "↺"}
                </Text>
              </TouchableOpacity>

              <View style={styles.ctxSep} />

              {/* Copy Arabic */}
              <TouchableOpacity
                style={styles.ctxRow}
                activeOpacity={0.5}
                onPress={() => {
                  if (
                    Platform.OS === "web" &&
                    typeof navigator !== "undefined" &&
                    navigator.clipboard
                  ) {
                    navigator.clipboard
                      .writeText(ayahs[index].arabic)
                      .catch(() => {});
                  }
                  Haptics.notificationAsync(
                    Haptics.NotificationFeedbackType.Success,
                  );
                  setVerseMenuVisible(false);
                }}
              >
                <Text style={styles.ctxRowLabel}>Copy Arabic</Text>
                <Text style={styles.ctxRowIcon}>⎘</Text>
              </TouchableOpacity>

              <View style={styles.ctxSep} />

              {/* Share Ayah */}
              <TouchableOpacity
                style={styles.ctxRow}
                activeOpacity={0.5}
                onPress={async () => {
                  const ayah = ayahs[index];
                  const shareText = `${ayah.arabic}\n\n${ayah.translation}\n\n— ${surah.nameLatin}, Ayah ${ayah.number}`;
                  setVerseMenuVisible(false);
                  try {
                    if (
                      Platform.OS === "web" &&
                      typeof navigator !== "undefined" &&
                      typeof (navigator as unknown as { share?: unknown }).share === "function"
                    ) {
                      await (navigator as unknown as { share: (data: { text: string }) => Promise<void> }).share({ text: shareText });
                    } else {
                      await Share.share({ message: shareText });
                    }
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  } catch {
                    // User cancelled or share not supported — silently ignore
                  }
                }}
              >
                <Text style={styles.ctxRowLabel}>Share Ayah</Text>
                <Text style={styles.ctxRowIcon}>↗</Text>
              </TouchableOpacity>
            </Pressable>
          </Animated.View>
        </Pressable>
      </Modal>
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
    fontSize: 12,
    letterSpacing: 0,
    color: "#8e8e93",
    fontWeight: "400",
    textShadowColor: "rgba(0,0,0,0.75)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  surahLabel: {
    fontSize: 17,
    color: "#f5f5f5",
    fontWeight: "600",
    flexShrink: 1,
    textShadowColor: "rgba(0,0,0,0.75)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  surahMeaning: {
    color: "#8e8e93",
    fontWeight: "400",
    fontSize: 17,
    textShadowColor: "rgba(0,0,0,0.75)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  surahArabicGlyph: {
    maxWidth: 190,
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
    fontSize: 13,
    letterSpacing: 0,
    color: "#8e8e93",
    fontWeight: "400",
    textShadowColor: "rgba(0,0,0,0.75)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
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
    // Default to KFGQPC Uthmanic Script HAFS — the official Madinah
    // mushaf typeface. Its ayah-end ornament glyphs (which wrap the
    // Arabic-Indic verse number in a rosette) are the "correct" mushaf
    // look. The user can swap to AmiriQuran from settings; the
    // `fontFamily` is overridden inline per-render in that case.
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
  sleepChip: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(232,192,120,0.10)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(232,192,120,0.35)",
    marginBottom: 12,
  },
  sleepChipText: {
    fontSize: 12,
    letterSpacing: 0,
    color: "#e8c078",
    fontWeight: "500",
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
  reciterEyebrowRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  reciterEyebrow: {
    fontSize: 11,
    letterSpacing: 0,
    color: "#8e8e93",
    fontWeight: "400",
    textShadowColor: "rgba(0,0,0,0.75)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  reciterNameRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
    gap: 4,
  },
  reciterName: {
    fontSize: 13,
    color: "#d4d4d4",
    fontWeight: "500",
    textShadowColor: "rgba(0,0,0,0.75)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  reciterChevron: {
    flexShrink: 0,
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
    justifyContent: "center",
  },
  // ── Apple UIContextMenu styles ─────────────────────────────────────────────
  // Overlay: full-screen dim. On web we add backdropFilter via inline style.
  ctxOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.50)",
    alignItems: "center",
    justifyContent: "center",
  },
  // Container: fixed width, spring-animated
  ctxContainer: {
    width: 320,
  },
  // ① Preview card: the verse "lifted" from the page
  ctxPreview: {
    backgroundColor: "rgba(18,18,18,0.98)",
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingVertical: 18,
    alignItems: "center",
    gap: 8,
    // Elevation / shadow
    shadowColor: "#000",
    shadowOpacity: 0.55,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 14 },
    elevation: 24,
  },
  ctxPreviewArabic: {
    color: "#ffffff",
    fontSize: 24,
    textAlign: "center",
    lineHeight: 42,
    writingDirection: "rtl",
  },
  ctxPreviewMeta: {
    color: "rgba(235,235,245,0.6)",
    fontSize: 12,
    letterSpacing: 0.2,
  },
  // ② Menu card: frosted glass. On web we add backdropFilter via inline style.
  ctxMenu: {
    backgroundColor: "rgba(44,44,46,0.92)",
    borderRadius: 14,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.45,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 16,
  },
  // Each action row — 44 pt tall (standard iOS touch target)
  ctxRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 44,
    paddingHorizontal: 16,
  },
  ctxRowLabel: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "400",
  },
  ctxRowIcon: {
    color: "rgba(235,235,245,0.6)",
    fontSize: 20,
  },
  // Separator: very faint, exactly like iOS
  ctxSep: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.14)",
    marginLeft: 16,
  },
  ayahRevealContainer: {
    flex: 1,
    overflow: "hidden",
  },
  ayahFadeTop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 80,
    pointerEvents: "none",
  },
  ayahFadeBottom: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 80,
    pointerEvents: "none",
  },
});

// ─── AyahView ────────────────────────────────────────────────────────────────
// Renders a single ayah (Arabic + translation).
//
// For long ayahs that exceed the visible stage height the user scrolls
// manually. Two LinearGradient overlays — one pinned to the top edge, one to
// the bottom — dissolve the text as it crosses the boundary so the clip never
// looks hard or abrupt. Their opacities are driven directly by onScroll, so
// they are always perfectly in sync with the user's finger (no timers, no
// animation delays, no auto-movement of any kind).
//
//   • Bottom fade  opacity 1 → 0  as user scrolls toward the end
//   • Top fade     opacity 0 → 1  as user scrolls away from the top
//
// Each fade transitions over FADE_ZONE dp of scroll travel.

const FADE_ZONE = 44; // dp — distance over which the gradient ramps 0↔1

type AyahViewProps = {
  ayah: { arabic: string; translation: string; number: number; globalNumber: number };
  opacity: Animated.Value;
  arabicFontFamily: string;
  arFs: number;
  arLh: number;
  translationFontSize: number;
  onTap: () => void;
  onLongPress?: () => void;
};

function AyahView({
  ayah,
  opacity,
  arabicFontFamily,
  arFs,
  arLh,
  translationFontSize,
  onTap,
  onLongPress,
}: AyahViewProps) {
  const topFade    = useRef(new Animated.Value(0)).current;
  const bottomFade = useRef(new Animated.Value(0)).current;

  // Track whether the bottom gradient should be visible at all (only when the
  // content actually overflows). Set via onContentSizeChange + onLayout.
  const viewportH  = useRef(0);
  const contentH   = useRef(0);

  // Initialise / reset the gradient state whenever the ayah changes.
  // Each ayah gets a fresh component instance (keyed by globalNumber) so this
  // is mainly a safety guard against edge-case instance reuse.
  useEffect(() => {
    topFade.setValue(0);
    bottomFade.setValue(0);
    viewportH.current = 0;
    contentH.current  = 0;
  }, [ayah.globalNumber, topFade, bottomFade]);

  // After either dimension is measured, show the bottom gradient if the
  // content is taller than the viewport (before the user has scrolled).
  const maybeShowInitialBottom = useCallback(() => {
    if (viewportH.current > 0 && contentH.current > 0) {
      const maxScroll = contentH.current - viewportH.current;
      bottomFade.setValue(maxScroll > FADE_ZONE ? 1 : Math.max(0, maxScroll / FADE_ZONE));
    }
  }, [bottomFade]);

  // Called on every scroll frame. Updates both gradient opacities instantly
  // so they track the scroll position with zero lag.
  const handleScroll = useCallback(
    (e: { nativeEvent: { contentOffset: { y: number }; contentSize: { height: number }; layoutMeasurement: { height: number } } }) => {
      const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
      const y         = contentOffset.y;
      const maxScroll = Math.max(0, contentSize.height - layoutMeasurement.height);

      // Top fade: invisible at y=0, fully opaque at y=FADE_ZONE.
      topFade.setValue(Math.min(1, y / FADE_ZONE));

      // Bottom fade: fully opaque when far from the bottom, invisible at bottom.
      bottomFade.setValue(
        maxScroll > 0 ? Math.min(1, (maxScroll - y) / FADE_ZONE) : 0,
      );

      // Keep dimension refs in sync (layout changes on orientation flip, etc.)
      viewportH.current = layoutMeasurement.height;
      contentH.current  = contentSize.height;
    },
    [topFade, bottomFade],
  );

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { opacity }]}>
      <View
        style={styles.ayahRevealContainer}
        onLayout={(e) => {
          viewportH.current = e.nativeEvent.layout.height;
          maybeShowInitialBottom();
        }}
      >
        <ScrollView
          contentContainerStyle={[styles.verseBox, { paddingVertical: 16 }]}
          showsVerticalScrollIndicator={false}
          bounces={false}
          scrollEnabled
          keyboardShouldPersistTaps="always"
          onScroll={handleScroll}
          scrollEventThrottle={16}
          onContentSizeChange={(_, h) => {
            contentH.current = h;
            maybeShowInitialBottom();
          }}
        >
          <Pressable onPress={onTap} onLongPress={onLongPress} delayLongPress={500} android_disableSound style={styles.verseInner}>
            <Text
              style={[
                styles.arabic,
                { fontSize: arFs, lineHeight: arLh, fontFamily: arabicFontFamily },
              ]}
              allowFontScaling={false}
            >
              {ayah.arabic}
              {ayahMarker(ayah.number)}
            </Text>
            <Text style={[styles.translation, { fontSize: translationFontSize }]}>
              {ayah.translation}
            </Text>
          </Pressable>
        </ScrollView>

        {/* Top dissolve — text gently fades as it scrolls behind the top edge */}
        <Animated.View style={[styles.ayahFadeTop, { opacity: topFade }]}>
          <LinearGradient
            colors={["rgba(0,0,0,0.88)", "transparent"]}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>

        {/* Bottom dissolve — signals overflow and dissolves text at the bottom */}
        <Animated.View style={[styles.ayahFadeBottom, { opacity: bottomFade }]}>
          <LinearGradient
            colors={["transparent", "rgba(0,0,0,0.88)"]}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      </View>
    </Animated.View>
  );
}
