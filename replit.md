# Overview

This project is a pnpm workspace monorepo using TypeScript, focused on developing a Quran listening mobile application called "quran-listener". The application allows users to listen to all 114 surahs of the Quran, ayah-by-ayah, with full Arabic (Uthmani script) and English (Sahih International) translation. Audio is streamed from the `cdn.islamic.network` Quran CDN.

The project aims to provide a high-quality, feature-rich mobile experience for Quran recitation, including customizable settings for reciters, backgrounds, ambient sounds, and playback controls. It leverages modern mobile development technologies to ensure a smooth and accessible user experience across iOS and Android platforms.

# User Preferences

I prefer iterative development and expect the agent to communicate clearly about major changes before implementing them. When making changes, I appreciate detailed explanations, especially concerning architectural decisions or significant code modifications. I prefer a coding style that is functional where appropriate. I also want the agent to use simple language when explaining complex topics.

# System Architecture

The project is structured as a pnpm monorepo with TypeScript. It uses Node.js 24 and pnpm as the package manager. The API layer, if developed, would use Express 5 with PostgreSQL and Drizzle ORM, and Zod for validation. API codegen is handled by Orval from an OpenAPI spec, and esbuild is used for CJS bundling.

The `quran-listener` mobile application is built with Expo / React Native.

**UI/UX Decisions:**
- **Color Scheme:** Pure black (`#000`) background by default, with optional photo backgrounds and a scrim.
- **Typography:**
    - Arabic verses use the KFGQPC font, centered, with a subtle warm text-shadow. Verse numbers are rendered in Arabic-Indic digits within the font's ornament glyphs.
    - English translations use a smaller, dimmer `text-neutral-400` font.
    - Surah names in the header and picker use calligraphic glyphs from the KFGQPC Surah Names font v1.
    - Custom Arabic fonts (`UthmanicHafs` and `AmiriQuran`) are bundled and user-selectable, with `UthmanicHafs` as default.
- **Layout:** Verses are stacked in the same place and opacity-toggled for smooth transitions. Long ayahs feature adaptive font sizing, per-verse `ScrollView` with `flexGrow:1, justifyContent:'center'`, and tightened line-height.
- **Player Controls:** Apple Human Interface Guidelines (HIG) compliant with prev/play-pause/next buttons, progress bars (segmented for short surahs, single for long), and haptic feedback. Play button shows an `ActivityIndicator` when buffering. Restart icon replaces play button upon surah completion.
- **Settings Panel:** Implemented as a bottom sheet with rounded top corners, a drag handle, and swipe-down-to-dismiss.
- **Marquee Text:** Reciter names in the footer use `MarqueeText` component for smooth, looping scroll when overflowing.
- **Sleep Timer:** Displays as a circular ring using `react-native-svg` for a visual countdown.
- **Scroll Edge Fade:** Long ayahs that overflow the screen have `LinearGradient` overlays at top and bottom to indicate scrollability and soften clipping.

**Technical Implementations:**
- **Audio Playback:** Uses `expo-audio` (pinned to `1.1.0` due to upstream bug) with `interruptionMode: 'mixWithOthers'` for simultaneous ambient and recitation audio.
- **Audio Error Handling:** Implements load timeouts (12s) and displays a `⚠️` for CDN/network failures.
- **Persistence:** Settings and last playback position are persisted using `AsyncStorage`. All loaded values are validated and clamped.
- **Data Layer:** `data/quran.json` contains the entire Quran corpus (~2.5 MB) generated from external APIs. `data/quran.ts` provides typed accessors and validation.
- **Surah/Ayah Picker:** Full-screen modal with search, filtering, and inline ayah selection.
- **Verse Transitions:** Configurable to "Instant" or "Crossfade" (700ms fade out, then 700ms fade in).
- **Playback Speed Control:** Six selectable speeds (0.5x, 0.75x, 1x, 1.25x, 1.5x, 2x) with pitch correction enabled.
- **Reciter Switching:** Designed for instant switching with zero audio bleed, rebuilding `AudioPlayer` instances only when necessary.
- **Skip Throttle:** Implemented a `SKIP_COOLDOWN_MS` (220ms) lock to prevent race conditions during rapid taps on skip buttons.
- **Audio Diagnostics:** A development-only diagnostic system (`runAudioDiagnostics`) is available to check audio player states.
- **Font Patching:** The `UthmanicHafs` font was patched to fix a `U+25CC` dotted-circle bug, with a reproducible script (`scripts/patch-font.py`) and a `render-check.mjs` utility for verification.

# External Dependencies

- **Monorepo tool**: pnpm workspaces
- **Package manager**: pnpm
- **TypeScript**: 5.9
- **Mobile Framework**: Expo / React Native
- **Audio Library**: `expo-audio` (version 1.1.0)
- **Haptics**: `expo-haptics`
- **SVG**: `react-native-svg`
- **API (backend)**: Express 5 (if API server is active)
- **Database (backend)**: PostgreSQL + Drizzle ORM (if API server is active)
- **Validation**: Zod (`zod/v4`), `drizzle-zod` (if API server is active)
- **API Codegen**: Orval (if API server is active)
- **Build Tool**: esbuild
- **Quran CDN**: `cdn.islamic.network` (for audio streaming)
- **Quran Data Sources**: `api.quran.com/api/v4/quran/verses/uthmani`, `alquran.cloud` (for `quran.json` generation)
- **Surah Names Font Source**: `qul.tarteel.ai/resources/font` (Tarteel QUL)