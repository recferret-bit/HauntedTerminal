# Animated 3D Comix Configuration Schema (`comix/<slug>/`)

Sources of truth: `src/cinematic/spec-types.ts`, `src/cinematic/simulate.ts`, and `src/comix-editor/{schema,schema-letters,schema-tracks,schema-fields,check}.ts`.

## 1. Folder Structure & Primitives

- `comix/<slug>/README.md` (human summary)
- `comix/<slug>/comix.manifest.json` (`ComixManifest`)
- `comix/<slug>/pages/page-XX-<slug>/page.spec.json` (`ComixPageSpec`)

Canonical JSON writer: `stringifyComixJson` (`scripts/harness/lib/comix-json.mjs`, also `generate-comix.mjs --format`).
MCP `credits-forge`: `list_comix`, `get_comix`, `validate_comix` (runs `checkComixPack` + 60fps `runComixSim`), `write_comix` (`baseEtag` check + full validation + sim + catalog recompile).

- **`PointRef`**: named landmark key in `manifest.stage.points` OR inline `{ x, y, z }`.
- **`TimeExpr`**: `"12.5"` (absolute seconds), `"+0.4"` (offset from parent panel/page `from`), or `"CUE"`, `"CUE+0.35"`, `"CUE-0.1"` (named in `manifest.cues` / `page.cues`).
- **`Rect4`**: `[x, y, w, h]` inside `0..1` with `w > 0, h > 0`.
- **`ShotBox`**: `{ x, y, w, h }` orthographic world camera framing.

## 2. `ComixManifest` (`comix.manifest.json`)

| Field | Type | Meaning |
|---|---|---|
| `id`, `title`, `subtitle`, `summary` | strings | `id` equals `<slug>` folder |
| `role?` | `'opening' \| 'ending' \| 'interlude' \| 'standalone'` | Placement role |
| `status` | `'playable' \| 'draft'` | Playable status |
| `durationSec` | number (`> 0`) | Total sequence length |
| `holdAtEnd?`, `acceptsKeyFrom?: TimeExpr`, `inputGraceMs?` | playback/key gating | Hold final frame and unlock key prompt |
| `skip` | `'end' \| Array<{ before: TimeExpr, to: TimeExpr }>` | Single or stepped skip targets |
| `cues?` | `Record<string, number>` | Sequence-wide cue timestamps |
| `stage` | `{ room, background, clampToRoom?, ambient?: StageAmbientConfig, points: Record<string, Vec3>, props?: Array<{ id, model, at, visible?, zOrder?, scale?, rotation? }>, fixtures?: StageFixtureSpec[] }` | `fixtures`: `rain` (`x,y,w,h,z,drops?`), `bolt` (`style: 'bolt'|'comic', from, to, seed?`), `vortex` (`at,z,w,h`); `scale`: `number \| [sx,sy,sz]`; `rotation`: `number \| [rx,ry,rz]` deg |
| `cast` | `Array<{ id, model, label?, at?: PointRef, zOrder?, scale?, rotation?, rotationZ?, visible?, look?: [number, number] }>` | Models from `ModelCatalog` |
| `pages` | `Array<{ index, id, title, from, until, panelCount, specPath }>` | Must match `pages/page-XX-<slug>/page.spec.json` |

## 3. `ComixPageSpec` (`page.spec.json`)

- **Top fields**: `id`, `index`, `title`, `summary`, `from`, `until` (`until > from`), `cues?`, `turn?: { from, to, ease: 'in'|'quad' }`, `overlays?: Array<{ kind: 'title_card', at, title, subtitle, typeFrom, typeTo, fadeFrom, fadeTo }>`, `tracks?: SceneTrack[]`, `panels: ComixPanelSpec[]`.
- **`ComixPanelSpec`**: `id`, `title`, `from: TimeExpr`, `until: TimeExpr`, `snapshotAt?: TimeExpr`, `layout: { landscape: Rect4, portrait: Rect4 }`, `camera: { from: ShotBox, to?: ShotBox, span?: [TimeExpr, TimeExpr], ease?: 'linear'|'in'|'out'|'outBack', portrait?: ShotBox }`, `letters?`, `beats?`, `tracks?`.

## 4. `PanelLetter` (All 12 Variants)

| `kind` | Key fields |
|---|---|
| `caption` | `text`, `from`, `until?`, `typeDur`, `mono?`, `position?: 'top'|'bottom'`, `maxWidth?` |
| `banner` | `text`, `at`, `until?`, `edge: 'top'|'bottom'` |
| `sfx` | `text`, `at`, `hold`, `color`, `tilt`, `anchor: 'frac'|'point'`, `x?`, `y?`, `point?`, `dx?`, `dy?`, `size`, `activePanelOnly?`, `freezeOnCut?` |
| `sfx_seq` | `words[]`, `tilts[]`, `from`, `step`, `hold`, `lastHold?`, `color`, `point`, `dx`, `dy`, `dxStep`, `dyStep`, `dxMod`, `dyMod`, `size`, `activePanelOnly?`, `freezeOnCut?` |
| `bubble` | `text`, `at`, `until?`, `style: 'speech'|'shout'|'thought'`, `fill?`, `activePanelOnly?`, `freezeOnCut?`, `anchor: 'panel'|'world'`, `x`, `y`, `w?`, `wChars?`, `yFloor?`, `minXChars?`, `fontH`, `fontW`, `minFont`, `fontOfMin?`, `fontScale?`, `tailActor?`, `tailPoint?`, `tailLift?`, `tailZ?`, `tailDx?`, `tailDy?` |
| `label_tag` | `text`, `at`, `until?`, `point`, `activePanelOnly?`, `freezeOnCut?` |
| `prompt_list` | `title`, `baseCount`, `from`, `every`, `items[]` |
| `glitch_text` | `from`, `step`, `texts[]`, `jitter?` |
| `tier_stack` | `from`, `step`, `rows: Array<{ who, what, bg, glow }>` |
| `panel_flash` | `at`, `dur`, `opacity`, `fade?`, `fadeFrom?`, `hold?`, `activePanelOnly?` |
| `invert` | `at`, `fromOffset`, `toOffset` |
| `stats_card` | `title`, `at`, `keyAt`, `rankColor`, `rankWord`, `labels: { rank, time, commands, shortcuts, press }`, `emptyShortcuts`, `fallbackBackground` |

## 5. `PanelBeat` (All 8 Variants)

| `kind` | Key fields |
|---|---|
| `lightning` | `at`, `point`, `power`, `flash`, `audio?: 'distant'|'thunder'` |
| `fx` | `at`, `preset` (`FxCatalog` id), `point`, `offset?`, `seed?`, `scale?`, `text?` |
| `fx_repeat` | `at`, `step`, `count`, `preset`, `point`, `offset?`, `seed?`, `scale?` |
| `arc` | `at`, `from`, `to`, `flash?` |
| `look` | `at`, `actors[]`, `x`, `y` |
| `state` | `at`, `actors[]`, `state` (`ANIM_STATE_IDS`) |
| `audio` | `at`, `cue: 'rain_on'|'rain_off'|'thunder'|'distant_thunder'|'burst'|'shatter'|'zap'`, `seconds?`, `reverse?` |
| `key_clicks` | `from`, `until`, `hz`, `chance` |

## 6. `SceneTrack` (All 9 Variants)

| `kind` | Key fields |
|---|---|
| `actor_visibility` | `actor` (`cast` or `stage.props` id), `from`, `until?`, `visible`, `hideWhenDead?` |
| `actor_motion` | `actor` (`cast` or `stage.props` id), `from`, `until?`, `span?`, `fromPos`, `toPos?`, `ease?`, `steps?`, `arc?`, `scaleFrom?`, `scaleTo?`, `scaleVecFrom?`, `scaleVecTo?`, `stretchFrom?`, `stretchTo?`, `rotZFrom?`, `rotZTo?`, `rotFrom?`, `rotTo?`, `zOrderFrom?`, `zOrderTo?`, `deform?: 'none'|'stretch_to_target'|'squash_land'`, `hideWhenDead?` |
| `actor_rig` | `actor` (`cast` or `stage.props` id), `from`, `until?`, `typing?`, `restRightArm?`, `hideParts?` |
| `part_visibility` | `target` (`"room"`, cast, or `stage.props` id), `parts[]`, `from`, `until?`, `visible` |
| `material_tint` | `target` (`"room"`, cast, or `stage.props` id), `zone`, `from`, `until?`, `color`, `glitchColors?`, `glitchHz?` |
| `fixture` | `fixture`, `from`, `until?`, `growDur?`, `steps?`, `flickerHz?`, `flickerEvery?`, `flickerSkip?`, `settleAfter?` |
| `stage_light` | `anchor`, `from`, `until`, `intensity`, `intensityTo?`, `ease?: 'linear'|'quad'|'in'|'out'`, `blinkHz?`, `blinkAmp?` |
| `camera_shake` | `from`, `until`, `amp`, `ampTo?` |
| `pixelate` | `from`, `until`, `sizeFrom`, `sizeTo`, `steps?`, `ease?` |
