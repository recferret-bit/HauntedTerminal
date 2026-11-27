# Audio Runtime & `/audio-lab` Configuration Schema

Sources of truth: `src/audio/{config,limits,loop-takes,music-for,sfx-for,catalog}.ts`, `src/contracts/app-bus.ts`, `src/audio-lab/app.ts`, and `scripts/harness/lib/audio-gen-inspect.mjs`.

## 1. Playback Tuning Config (`src/audio/config.ts`)

| Export | Type | Purpose |
|---|---|---|
| `SFX_TRIM` | `Partial<Record<SfxId, { offset: number; duration?: number }>>` | Active trim windows (seconds) bypassing leading/trailing MP3 silence for 0ms latency |
| `LOOP_CUE_IDS` | `readonly SfxId[]` | `rain_loop`, `lap_fan`, `dad_typing_loop`, `dad_rig_loop`, `low_hp_loop`, `pickup_hover` |
| `LOOP_GAINS` | `Partial<Record<SfxId, number>>` | Ambient/loop per-cue mix gains (`rain_loop: 0.22`, `lap_fan: 0.28`, `dad_typing_loop: 0.16`, `dad_rig_loop: 0.03`) |
| `CROSSFADE_LOOPS` | `ReadonlySet<SfxId>` | Single-file ambient loops played via `playBed` 120 ms overlap crossfade (`dad_rig_loop`) |
| `LOOP_ACCENTS` | `Partial<Record<SfxId, LoopAccentSpec>>` | Random-interval ambient one-shot accents paired with a loop (`dad_rig_loop` -> `dad_rig_beep..3`, `dad_rig_spark..3`, 2.2–6.5 s, gain `0.08`) |
| `DEFAULT_LOOP_GAIN` | `number` (`0.35`) | Fallback gain when a loop cue is absent from `LOOP_GAINS` |
| `TYPING_SFX` | `ReadonlySet<SfxId>` | Capped to `TYPING_SOUND_SOURCES` (`3`) simultaneous voices |
| `THROTTLED_TYPING_SFX` | `ReadonlySet<SfxId>` | Rate-limited to `TYPING_MIN_INTERVAL_MS` (`100ms`); `key_enter` & `tab_complete` bypass throttle |
| `KEY_VARIANTS` | `Partial<Record<SfxId, SfxId[]>>` | `key_press` (`1..3`), `key_backspace` (`1..2`) |
| `TAUNT_VARIANTS` | `Partial<Record<SfxId, SfxId[]>>` | 10 rotated takes each (`taunt_antigravy_1..10`, `taunt_codec_1..10`, `taunt_gork_1..10`, `taunt_clod_1..10`, `kiro_advice..10`, `dad_cheer..10`) |
| `SPEECH_SFX` | `ReadonlySet<SfxId>` | `'dialog_hero'` plus all `TAUNT_VARIANTS` |
| `KEY_RATES` / `KEY_GAINS` | `readonly number[]` | Pitch & gain round-robin variation tables for typing cues |
| `LOOP_TAKES` (`loop-takes.ts`) | `Partial<Record<SfxId, SfxId[]>>` | Optional non-repeating playlist takes (currently empty) |
| `SOUND_SOURCES` (`limits.ts`) | `10` | Default pooled one-shot voices (loops & music beds have dedicated slots) |

## 2. `MusicScene` Priority (`src/audio/music-for.ts`)

`MusicSurface`: `'title' | 'level-select' | 'manual' | 'achievements' | 'comic' | 'play' | 'laptop' | 'lab' | 'cine-intro' | 'cine-outro' | 'rank'`.

Resolution order in `musicFor(scene)`:
1. `scene.surface === 'rank'` -> `'rank_card'`
2. `scene.menu` -> `'menu_bed'`
3. `scene.reading` -> `'manual_bed'`
4. `scene.surface !== 'play'` -> `SURFACE_BED[scene.surface] ?? null` (`title_theme`, `level_select`, `manual_bed`, `achievements_bed`, `comic_reader`, `laptop_bed`, `lab_bed`, `cine_intro`, `cine_outro`)
5. `scene.battle !== 'none' && scene.lowHp` -> `'low_hp_bed'`
6. `scene.battle === 'boss'` -> `'battle_boss'`
7. `scene.battle === 'fight'` -> `'battle_loop'`
8. `scene.hub` -> `'hub_matrix'`
9. `scene.floorTheme` (`1..5`) -> `floor_attic | floor_crypt | floor_maze | floor_furnace | floor_core` (else `null`).

## 3. `AppBus` Events (`src/contracts/app-bus.ts`)

Event kinds mapped by `sfxFor` (plus `audio-hold` handled directly by `attachOrchestrators`): `kernel`, `pointer`, `key` (`press|enter|backspace|tab`), `command` (`ok|fail|locked`), `scene`, `menu`, `restart` (`arm|go`), `manual`, `timer`, `laptop` (`LaptopAction`), `loop` (`LoopCue`, `on`), `cine` (`CineCue`), `letter` (`letter: LetterCue`), `dialog` (`speaker`), `page`, `audio-hold` (`paused`).

## 4. `/audio-lab` Workbench & `window.__audioLab`

```ts
interface AudioLabHandle {
  ready: Promise<void>;
  selectCue(id: string): Promise<void>;
  playCue(id: string, opts?: { raw?: boolean }): Promise<void>;
  setTrim(id: string, trim: { offset: number; duration?: number }): void;
  setLoop(id: string, on: boolean, gain?: number): void;
  testScene(scene: MusicScene | null): void;
  emit(ev: AppEvent): void;
  state(): AudioLabSnapshot;
  dispose(): void;
}
```

Filters (`AudioFilterId`): `'all' | 'trimmed' | 'voice' | 'loop' | 'typing' | 'music'`.

## 5. `audio-gen.mjs inspect` Output (`--json`)

`node scripts/harness/audio-gen.mjs inspect <cue>...|--all [--json]` outputs:
`{ ffmpegAvailable, count, cues: [{ name, group, kind, loop, loopGain, listedSeconds, requestedSeconds, trim, trimCheck: { offsetValid, durationValid, uncoveredLeadSec, trimmedActiveSec } | null, listRow: { present, row, kind, listedSeconds, loop, variant, secondsAligned }, post, files, metrics: { durationSec, maxDb, meanDb, leadingSilenceSec, trailingSilenceSec, activeSec } | null }] }`.

## 6. Music Composition Plans, Stingers & Seamless Bed Looping

- **Stored plans (`public/music/plans/<cue>.json`)**: outer envelope `{ name, listed_seconds, loop, model, plan_ms, plan: { chunks: [{ duration_ms, context_adherence, positive_styles, negative_styles, text }] } }`. `storedPlan()` in `scripts/harness/lib/audio-gen-request.mjs` sends `--json { composition_plan: doc.plan, model_id: 'music_v2_5' }` instead of `--prompt`.
- **Stingers (`sting_clear`, `sting_kiro`, `sting_lantern`)**: authored in `docs/audio/MUSIC_LIST.md` (`music_v2_5` / `public/music/plans/<name>.json`) while targeting runtime `public/sfx/<take>.mp3` and `public/sfx/manifest.json` (`source: 'music_v2_5'`, listed in `SFX_IDS`).
- **Seamless looping (`src/audio/bed-loop.ts`)**: `XFADE_SEC = 0.12` overlaps consecutive passes of a looping music bed with a 120 ms linear crossfade (`playBed`) to mask MP3 encoder padding clicks without using `AudioBufferSourceNode.loop`.
