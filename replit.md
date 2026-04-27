# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Artifacts

- **quran-listener** (`/`) — **Expo / React Native** mobile app. Plays Surah Al-Fatiha ayah-by-ayah (Mishary Rashid Alafasy) with the Arabic text shown in the middle of a black screen. Audio streamed from the `cdn.islamic.network` Quran CDN. No backend; surah data lives in `data/al-fatiha.ts`. Settings persist via AsyncStorage.

  **Previously a React + Vite PWA — was migrated to Expo on 2026-04-27 to enable native iOS/Android distribution. The free tier only allows one artifact at a time, so the web version was removed during the swap. The full feature spec below was preserved so behavior matches.**

## quran-listener — Feature Spec

### Visual / Audio
- **Reciter**: Mishary Rashid Alafasy.
- **Audio source**: `https://cdn.islamic.network/quran/audio/128/ar.alafasy/{1..7}.mp3` (one MP3 per ayah).
- **Background**: pure black (`#000`), with a subtle radial glow `radial-gradient(circle at 50% 45%, rgba(180,150,90,0.10), transparent 55%)` behind the verse.
- **Surah header (left)**: small uppercase eyebrow "SURAH 1", then `Al-Fatiha — The Opening`.
- **Surah header (right)**: `الفاتحة` in the Quran font, with a settings (gear) icon to its left.
- **Ayah counter**: `AYAH N OF 7` in tracked uppercase, centered above the verse.
- **Arabic verse**: large centered RTL text in the KFGQPC font, with subtle warm text-shadow `0 0 40px rgba(255,220,160,0.15)`. Each verse ends with a non-breaking space + the verse number rendered in Arabic-Indic digits — the KFGQPC font draws each digit inside its own ornament glyph, which IS the proper end-of-ayah marker (do NOT also prepend U+06DD; that draws an additional empty rosette next to the digit).
- **Translation**: Sahih International English under the Arabic, smaller and dimmer (`text-neutral-400`), max width ~2xl, top margin ~3rem.

### Layout — no shift between ayahs
All 7 ayahs are mounted in the same place, opacity-toggled rather than mounted/unmounted. The container is sized to the longest verse so vertical position stays stable through the whole recitation.

### Player controls (bottom)
- 7 thin horizontal segments — one per ayah — that fill left-to-right as audio plays. Past ayahs show 100%, current shows live progress, future show 0%.
- Center: prev / play-pause / next. Play button is a 64×64 white circle. While buffering, an animated ping ring shows around it. When the surah finishes, the play button becomes a "restart" icon (`RotateCcw`).
- Bottom-left: reciter name. Bottom-right: "RESTART" text button.

### Settings panel (gear in top-right header)
Opens a slide-in panel from the right. First (and currently only) section: **Ayah transition** — the cross-fade behavior between verses. Five options, persisted to local storage (web) / AsyncStorage (native):

| id         | label         | duration | through-black | description                                    |
|------------|---------------|----------|---------------|------------------------------------------------|
| instant    | Instant       | 0        | false         | No animation — verses snap immediately         |
| quick      | Quick         | 350 ms   | false         | Brief crossfade                                |
| smooth     | Smooth        | 1100 ms  | false         | Default — gentle crossfade                     |
| slow       | Slow          | 2000 ms  | false         | Deliberate crossfade                           |
| blackout   | Through black | 1600 ms  | true          | Fade fully to black, then fade in next verse   |

- For crossfade modes, both the outgoing and incoming verses are rendered simultaneously and just opacity-toggled — they overlap mid-transition. `transitionDuration` = mode duration.
- For "Through black", the whole stage's opacity goes to 0 over `duration/2`, then `displayedIndex` swaps to the new verse, then stage opacity goes back to 1 over the remaining `duration/2`. Per-verse transition is 0 in this mode.
- Default selection: `smooth`.

### Data file (reusable across web/native)
Located at `data/al-fatiha.ts`. Pure TypeScript — no DOM/React. Exports: `Ayah` interface, `ayahs`, `surahName` ("Al-Fatiha"), `surahNameArabic` ("الفاتحة"), `surahMeaning` ("The Opening"), `reciter` ("Mishary Rashid Alafasy"), `ayahMarker(n)` (returns ` ` + Arabic-Indic digits — NO U+06DD).

### Font
**KFGQPC Uthmanic Script HAFS** (the official typeface from the King Fahd Glorious Quran Printing Complex in Madinah). The `.otf` file (~240 KB) is bundled locally — do not rely on a CDN. License is non-commercial.

Source URL: `https://raw.githubusercontent.com/raflyfahrezi/KFGQPC-Uthmanic-Script-HAFS-Regular/master/arabic.otf` (also identical to `mustafa0x/qpc-fonts/various/UthmanicHafs1 Ver09.otf`).

The original file is preserved at `.local/preserved/UthmanicHafs.otf` for re-use.

### Preserved source files (for reference during the Expo rebuild)
- `.local/preserved/al-fatiha.ts` — surah data (use as-is)
- `.local/preserved/transitions.ts` — transition mode constants (use as-is)
- `.local/preserved/UthmanicHafs.otf` — Arabic font (copy into `assets/fonts/`)
- `.local/preserved/player.web.tsx` — original web player component (rewrite for RN)
- `.local/preserved/SettingsPanel.web.tsx` — original web settings panel (rewrite for RN)
- `.local/preserved/useSettings.web.ts` — settings hook (rewrite to use AsyncStorage)
