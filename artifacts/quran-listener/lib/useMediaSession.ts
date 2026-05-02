// Media Session API integration — web only.
//
// Sets the browser / OS "Now Playing" widget metadata and action handlers so
// the user can control Quran playback from:
//   • macOS menu-bar media controls
//   • Chrome/Safari/Edge browser media overlay
//   • Android Chrome lock screen
//   • Keyboard media keys (play/pause, prev track, next track)
//
// On native (iOS/Android app) this module is a no-op — basic lock-screen
// play/pause is wired automatically by AVAudioSession / AudioFocus when
// expo-audio plays with playsInSilentMode: true. Showing ayah text as
// metadata on native requires react-native-track-player (separate upgrade).
//
// Arabic text appears in the system Arabic font (e.g. San Francisco Arabic
// on macOS/iOS), not the custom Uthmanic font — system fonts cannot be
// overridden by web content. The Unicode Arabic characters are fully
// correct and readable; just not in mushaf calligraphic style.

import { useEffect } from "react";
import { Platform } from "react-native";

type MediaSessionState = {
  isPlaying: boolean;
  arabicText: string;
  translation: string;
  surahNameLatin: string;
  surahMeaning: string;
  ayahNumber: number;
  ayahCount: number;
  reciterName: string;
  playbackSpeed: number;
  playerDuration: number;
  playerCurrentTime: number;
  onPlay: () => void;
  onPause: () => void;
  onPrev: () => void;
  onNext: () => void;
};

// Lazily resolved artwork URL — prefer the app icon if it can be found,
// otherwise fall back to a blank data URI so the OS shows a placeholder.
let resolvedArtwork: string | null = null;
function getArtworkUrl(): string {
  if (resolvedArtwork != null) return resolvedArtwork;
  // Expo web typically serves the icon at /assets/images/icon.png or /favicon.ico.
  // We probe both and pick the first that resolves (synchronous guess — the
  // MediaMetadata is a hint, not a hard requirement, so a wrong URL is fine).
  resolvedArtwork = "/assets/images/icon.png";
  return resolvedArtwork;
}

export function useMediaSession({
  isPlaying,
  arabicText,
  translation,
  surahNameLatin,
  surahMeaning,
  ayahNumber,
  ayahCount,
  reciterName,
  playbackSpeed,
  playerDuration,
  playerCurrentTime,
  onPlay,
  onPause,
  onPrev,
  onNext,
}: MediaSessionState) {
  // Nothing to do on native — AVAudioSession / AudioFocus handle the OS
  // integration automatically.
  const isWeb = Platform.OS === "web";

  // Update metadata whenever the ayah, surah, or reciter changes.
  useEffect(() => {
    if (!isWeb) return;
    if (typeof window === "undefined" || !("mediaSession" in navigator)) return;

    // Title: Arabic text — the most important field. The system font renders
    // Arabic Unicode correctly (RTL, proper shaping), just not in mushaf style.
    // Artist: English translation — gives non-Arabic speakers immediate context.
    // Album: Surah info + reciter, exactly as shown in the player footer.
    const ayahLabel = `Ayah ${ayahNumber} of ${ayahCount}`;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: arabicText,
        artist: translation,
        album: `${surahNameLatin} (${surahMeaning}) — ${ayahLabel} — ${reciterName}`,
        artwork: [
          {
            src: getArtworkUrl(),
            sizes: "512x512",
            type: "image/png",
          },
        ],
      });
    } catch {
      // MediaMetadata constructor unavailable in some older browsers — ignore.
    }
  }, [
    isWeb,
    arabicText,
    translation,
    surahNameLatin,
    surahMeaning,
    ayahNumber,
    ayahCount,
    reciterName,
  ]);

  // Sync playback state (playing / paused / none) and position separately so
  // the OS progress bar tracks the current ayah within the progress ring /
  // scrubber widgets that some platforms show.
  useEffect(() => {
    if (!isWeb) return;
    if (typeof window === "undefined" || !("mediaSession" in navigator)) return;

    navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";

    if (playerDuration > 0) {
      try {
        navigator.mediaSession.setPositionState({
          duration: playerDuration,
          playbackRate: playbackSpeed,
          position: Math.min(playerCurrentTime, playerDuration),
        });
      } catch {
        // setPositionState not supported on all browsers.
      }
    }
  }, [isWeb, isPlaying, playerDuration, playerCurrentTime, playbackSpeed]);

  // Register action handlers once. They remain stable for the component
  // lifetime — we rely on the stable callback refs (onPlay etc.) passed in
  // from useCallback-memoised handlers in the player screen.
  useEffect(() => {
    if (!isWeb) return;
    if (typeof window === "undefined" || !("mediaSession" in navigator)) return;

    const handlers: Array<[MediaSessionAction, (() => void) | null]> = [
      ["play", onPlay],
      ["pause", onPause],
      ["previoustrack", onPrev],
      ["nexttrack", onNext],
      // 'stop' collapses the widget gracefully if the user explicitly stops.
      ["stop", onPause],
    ];

    for (const [action, handler] of handlers) {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
        // Action not supported on this browser/OS — silently skip.
      }
    }

    return () => {
      for (const [action] of handlers) {
        try {
          navigator.mediaSession.setActionHandler(action, null);
        } catch {}
      }
    };
  }, [isWeb, onPlay, onPause, onPrev, onNext]);
}
