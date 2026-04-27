import { useEffect, useRef, useState } from "react";
import { Play, Pause, SkipBack, SkipForward, RotateCcw } from "lucide-react";
import {
  ayahMarker,
  ayahs,
  reciter,
  surahMeaning,
  surahName,
  surahNameArabic,
} from "@/data/al-fatiha";

export default function Player() {
  const [index, setIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [hasFinished, setHasFinished] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const currentAyah = ayahs[index];

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.src = currentAyah.audioUrl;
    audio.load();
    setProgress(0);
    if (isPlaying) {
      setIsLoading(true);
      audio.play().catch(() => {
        setIsPlaying(false);
        setIsLoading(false);
      });
    }
  }, [index]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTime = () => {
      if (audio.duration > 0) {
        setProgress((audio.currentTime / audio.duration) * 100);
      }
    };
    const onEnded = () => {
      if (index < ayahs.length - 1) {
        setIndex((i) => i + 1);
      } else {
        setIsPlaying(false);
        setHasFinished(true);
        setProgress(100);
      }
    };
    const onPlaying = () => setIsLoading(false);
    const onWaiting = () => setIsLoading(true);
    const onCanPlay = () => setIsLoading(false);

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("playing", onPlaying);
    audio.addEventListener("waiting", onWaiting);
    audio.addEventListener("canplay", onCanPlay);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("playing", onPlaying);
      audio.removeEventListener("waiting", onWaiting);
      audio.removeEventListener("canplay", onCanPlay);
    };
  }, [index]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (hasFinished) {
      setHasFinished(false);
      setIndex(0);
      setIsPlaying(true);
      return;
    }
    if (audio.paused) {
      setIsLoading(true);
      audio
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => {
          setIsPlaying(false);
          setIsLoading(false);
        });
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  };

  const goPrev = () => {
    if (index > 0) {
      setHasFinished(false);
      setIndex(index - 1);
    } else {
      const audio = audioRef.current;
      if (audio) audio.currentTime = 0;
    }
  };

  const goNext = () => {
    if (index < ayahs.length - 1) {
      setHasFinished(false);
      setIndex(index + 1);
    }
  };

  const restart = () => {
    setHasFinished(false);
    setIndex(0);
    setIsPlaying(true);
  };

  return (
    <div className="relative min-h-[100svh] w-full overflow-hidden bg-black text-white">
      <audio ref={audioRef} preload="auto" />

      {/* Subtle radial glow behind the text */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 50% 45%, rgba(180, 150, 90, 0.10), transparent 55%)",
        }}
      />

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-6 pt-[max(env(safe-area-inset-top),1.5rem)] sm:px-10">
        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] text-neutral-500">
            Surah 1
          </p>
          <h1 className="mt-1 text-base font-medium tracking-wide text-neutral-200 sm:text-lg">
            {surahName}{" "}
            <span className="text-neutral-500">— {surahMeaning}</span>
          </h1>
        </div>
        <div className="text-right">
          <p
            className="text-2xl text-neutral-200 sm:text-3xl"
            style={{
              fontFamily:
                "'KFGQPC Uthmanic Hafs', 'Amiri Quran', 'Amiri', serif",
            }}
          >
            {surahNameArabic}
          </p>
        </div>
      </header>

      {/* Main ayah display */}
      <main className="relative z-10 flex min-h-[calc(100svh-200px)] items-center justify-center px-6 sm:px-12">
        <div className="relative mx-auto w-full max-w-5xl text-center">
          {/* Ayah counter — stable, doesn't animate with verse */}
          <p className="mb-10 text-xs uppercase tracking-[0.45em] text-neutral-500">
            Ayah {currentAyah.number} of {ayahs.length}
          </p>

          {/*
            Crossfading Arabic + translation block.

            All ayahs are always rendered in the same CSS grid cell, so:
              - The container is sized to the LONGEST ayah (no vertical shift
                between verses — the box never changes height).
              - Switching ayahs is just an opacity toggle, so the outgoing
                verse fades out at the same time the incoming one fades in
                (true crossfade, no gap).
          */}
          <div className="grid place-items-center">
            {ayahs.map((a, i) => {
              const isActive = i === index;
              return (
                <div
                  key={a.number}
                  aria-hidden={!isActive}
                  className="col-start-1 row-start-1 transition-opacity ease-in-out"
                  style={{
                    opacity: isActive ? 1 : 0,
                    transitionDuration: "1100ms",
                    pointerEvents: isActive ? "auto" : "none",
                  }}
                >
                  <p
                    dir="rtl"
                    lang="ar"
                    className="text-4xl leading-[1.9] text-white sm:text-5xl md:text-6xl lg:text-7xl"
                    style={{
                      fontFamily:
                        "'KFGQPC Uthmanic Hafs', 'Amiri Quran', 'Amiri', 'Scheherazade New', serif",
                      fontWeight: 400,
                      textShadow: "0 0 40px rgba(255, 220, 160, 0.15)",
                      fontFeatureSettings:
                        "'liga' 1, 'rlig' 1, 'calt' 1, 'dlig' 1, 'ccmp' 1",
                      fontVariantLigatures: "contextual",
                    }}
                  >
                    {a.arabic}
                    {ayahMarker(a.number)}
                  </p>
                  <p className="mx-auto mt-12 max-w-2xl text-sm leading-relaxed text-neutral-400 sm:text-base">
                    {a.translation}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </main>

      {/* Footer / controls */}
      <footer className="absolute inset-x-0 bottom-0 z-10 px-6 pb-[max(env(safe-area-inset-bottom),2rem)] sm:px-10">
        {/* Progress bar */}
        <div className="mx-auto mb-6 w-full max-w-3xl">
          <div className="flex gap-1.5">
            {ayahs.map((a, i) => {
              const fill =
                i < index ? 100 : i === index ? progress : 0;
              return (
                <div
                  key={a.number}
                  className="h-[3px] flex-1 overflow-hidden rounded-full bg-neutral-800"
                >
                  <div
                    className="h-full rounded-full bg-neutral-200 transition-[width] duration-200 ease-linear"
                    style={{ width: `${fill}%` }}
                  />
                </div>
              );
            })}
          </div>
        </div>

        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
          <div className="hidden flex-1 sm:block">
            <p className="text-[10px] uppercase tracking-[0.3em] text-neutral-600">
              Reciter
            </p>
            <p className="mt-1 text-xs text-neutral-400">{reciter}</p>
          </div>

          <div className="flex flex-1 items-center justify-center gap-6">
            <button
              type="button"
              onClick={goPrev}
              aria-label="Previous ayah"
              className="rounded-full p-2 text-neutral-400 transition hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
              disabled={index === 0 && progress < 1}
            >
              <SkipBack className="h-5 w-5" />
            </button>

            <button
              type="button"
              onClick={togglePlay}
              aria-label={isPlaying ? "Pause" : "Play"}
              className="group relative flex h-16 w-16 items-center justify-center rounded-full bg-white text-black transition hover:scale-105 hover:bg-neutral-100 active:scale-95"
            >
              {hasFinished ? (
                <RotateCcw className="h-6 w-6" />
              ) : isPlaying ? (
                <Pause className="h-6 w-6" />
              ) : (
                <Play className="ml-0.5 h-6 w-6" />
              )}
              {isLoading && isPlaying && (
                <span className="absolute inset-0 animate-ping rounded-full bg-white/30" />
              )}
            </button>

            <button
              type="button"
              onClick={goNext}
              aria-label="Next ayah"
              className="rounded-full p-2 text-neutral-400 transition hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
              disabled={index === ayahs.length - 1}
            >
              <SkipForward className="h-5 w-5" />
            </button>
          </div>

          <div className="hidden flex-1 justify-end sm:flex">
            <button
              type="button"
              onClick={restart}
              className="text-[11px] uppercase tracking-[0.25em] text-neutral-500 transition hover:text-neutral-200"
            >
              Restart
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
