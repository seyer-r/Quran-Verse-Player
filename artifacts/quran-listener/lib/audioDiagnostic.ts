// Audio diagnostic system — captures the live audio state and runs a suite
// of consistency checks. Call runAudioDiagnostics() from the DevMenu or from
// the browser console (window.__audioState = ...) to verify audio health.
//
// The diagnostic is deliberately side-effect-free: it only reads state and
// returns structured results that can be logged, rendered, or asserted in CI.

export type DiagnosticState = {
  // React UI state
  isPlaying: boolean;
  hasFinished: boolean;
  isLoading: boolean;
  audioError: boolean;
  repeatAyah: boolean;
  index: number;
  ayahCount: number;
  // Live player state
  playerLoaded: boolean;
  playerPlaying: boolean;
  playerDuration: number;
  playerCurrentTime: number;
  // Settings
  playbackSpeed: number;
  reciterId: string;
};

export type DiagResult = {
  id: string;
  description: string;
  passed: boolean;
  note?: string;
};

/**
 * Run all diagnostic checks against a snapshot of current audio state.
 * Returns one DiagResult per check; each has a stable `id` for regression tracking.
 */
export function runAudioDiagnostics(s: DiagnosticState): DiagResult[] {
  const results: DiagResult[] = [];

  // T1 — Play state: React says playing → player should be playing or loading
  {
    const bad =
      s.isPlaying &&
      !s.playerPlaying &&
      !s.isLoading &&
      !s.audioError &&
      !s.hasFinished;
    results.push({
      id: "T1_play_state",
      description: "Play state consistent (isPlaying → player.playing or loading)",
      passed: !bad,
      note: bad
        ? "isPlaying=true but player is neither playing nor loading — possible stall"
        : undefined,
    });
  }

  // T2 — Pause state: React says not playing → player should not be playing
  {
    const bad = !s.isPlaying && s.playerPlaying;
    results.push({
      id: "T2_pause_state",
      description: "Pause state consistent (!isPlaying → !player.playing)",
      passed: !bad,
      note: bad
        ? "isPlaying=false but player still reports playing — pause did not propagate"
        : undefined,
    });
  }

  // T3 — Loading clears once player is ready
  {
    const bad = s.isLoading && s.playerLoaded && s.playerDuration > 0;
    results.push({
      id: "T3_loading_clears",
      description: "Loading indicator clears once player is ready",
      passed: !bad,
      note: bad ? "isLoading=true but player is fully loaded — spinner is stuck" : undefined,
    });
  }

  // T4 — Finished state is mutually exclusive with active play
  {
    const bad = s.hasFinished && s.isPlaying;
    results.push({
      id: "T4_finished_exclusive",
      description: "hasFinished and isPlaying are mutually exclusive",
      passed: !bad,
      note: bad ? "hasFinished=true AND isPlaying=true — inconsistent state post-completion" : undefined,
    });
  }

  // T5 — Ayah index within surah bounds
  {
    const bad = s.index < 0 || s.index >= s.ayahCount;
    results.push({
      id: "T5_index_bounds",
      description: `Ayah index in range [0, ${s.ayahCount - 1}]`,
      passed: !bad,
      note: bad ? `index=${s.index} is out of bounds (ayahCount=${s.ayahCount})` : undefined,
    });
  }

  // T6 — Repeat mode does not produce a finished state
  {
    const bad = s.repeatAyah && s.hasFinished;
    results.push({
      id: "T6_repeat_no_finish",
      description: "Repeat mode prevents finished state",
      passed: !bad,
      note: bad
        ? "repeatAyah=true but hasFinished=true — repeat loop failed to re-trigger"
        : undefined,
    });
  }

  // T7 — Player currentTime within duration
  {
    const bad =
      s.playerLoaded &&
      s.playerDuration > 0 &&
      s.playerCurrentTime > s.playerDuration + 0.5;
    results.push({
      id: "T7_time_bounds",
      description: "Player currentTime ≤ duration",
      passed: !bad,
      note: bad
        ? `currentTime=${s.playerCurrentTime.toFixed(2)}s > duration=${s.playerDuration.toFixed(2)}s`
        : undefined,
    });
  }

  // T8 — Playback speed in valid range
  {
    const valid = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];
    const bad = !valid.includes(s.playbackSpeed);
    results.push({
      id: "T8_speed_valid",
      description: `Playback speed is a valid preset (${s.playbackSpeed}×)`,
      passed: !bad,
      note: bad ? `speed=${s.playbackSpeed} is not in valid presets: ${valid.join(", ")}` : undefined,
    });
  }

  // T9 — Reciter ID is a non-empty string
  {
    const bad = !s.reciterId || s.reciterId.trim() === "";
    results.push({
      id: "T9_reciter_id",
      description: "Reciter ID is set",
      passed: !bad,
      note: bad ? "reciterId is empty — audio URLs cannot be constructed" : undefined,
    });
  }

  // T10 — If playing, player must have loaded at least once
  {
    const bad = s.isPlaying && !s.isLoading && !s.playerLoaded && !s.audioError;
    results.push({
      id: "T10_play_requires_load",
      description: "Playing audio requires a loaded player",
      passed: !bad,
      note: bad ? "isPlaying=true but player not loaded and not loading — broken player" : undefined,
    });
  }

  return results;
}

/** Format diagnostics as a readable console report. */
export function formatDiagnostics(results: DiagResult[]): string {
  const passed = results.filter((r) => r.passed).length;
  const lines: string[] = [
    "╔══ Audio Diagnostics ══╗",
    `  ${passed}/${results.length} checks passed`,
    "╟───────────────────────╢",
  ];
  for (const r of results) {
    lines.push(`  ${r.passed ? "✓" : "✗"} [${r.id}] ${r.description}`);
    if (r.note) lines.push(`       ↳ ${r.note}`);
  }
  lines.push("╚═══════════════════════╝");
  return lines.join("\n");
}
