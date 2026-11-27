# Flying bats rework: design

Status: see requirements.md

## Pieces

```
src/procgen/archetypes/props/kiroween.ts   rework buildBat (`prop.bat`, perched upside-down roost bat) + add buildFlyingBat (`prop.bat_flying`, side / 3/4 cartoon flight bat)
src/procgen/archetypes/props.ts            register `prop.bat_flying` alongside updated `prop.bat` lore in ModelCatalog
src/renderer/stage-bats.ts                 switch stage flocks to `prop.bat_flying`, mirror + pitch along Bézier tangent, emit `bat_wings` on flock entry + 4+-bat stagger
docs/audio/SFX_LIST.md                     add row 151 `bat_wings` (fast, punchy cartoon bat wing claps prompt, <= 450 chars)
public/sfx/bat_wings.mp3                   generated via `node scripts/harness/audio-gen.mjs plan bat_wings --generate`
public/sfx/manifest.json                   patched atomically by `audio-gen.mjs` with `bat_wings` entry
src/contracts/audio-cues.ts                append `'bat_wings'` to `SFX_IDS` in manifest order
src/audio/config.ts                        add `KEY_VARIANTS.bat_wings = ['bat_wings']` (rate/gain micro-variation) + `SFX_TRIM.bat_wings` if leading/trailing trim applies
src/audio/sfx-app.ts                       explicitly route `'bat_wings'` in stage `sfx` event lookup so `audio-gen.mjs --check` and `audio-unit.mjs` verify mapping
scripts/harness/architecture-unit.mjs      add deterministic unit coverage for `stage-bats.ts` (`prop.bat_flying` travel facing/pitch, flock entry + 4+-bat staggered `bat_wings` SFX, pause/reduced-motion silence)
.kiro/skills/credits-art-direction/references/world-lexicon.md
.kiro/steering/tech.md                     document `prop.bat` (perched) + `prop.bat_flying` + `bat_wings` flock cue
```

## Decisions

- **Perched `prop.bat` vs. dedicated `prop.bat_flying` (follows Req 1, 2 & Decision Q3).**
  - `prop.bat` (`category: 'prop'`, `tags: ['hover', 'wall']`, centred near `y = 0.54` so existing room placements at `y: 2.95` need zero level edits) becomes an upside-down roosting cartoon bat: tiny `copper` hook-toes anchored to a minimal `rubber` shadow cleat at the top (`y ~ 0.86..0.88`), a plump `pcbBlue` furry torso framed by folded scalloped `solder` bat-wings with `copper` thumb claws and a `plastic` chest ruff, and a chubby `solder` head turned slightly 3/4 (`paper` side fang, zero `-z` eyes) with twin hanging pointed ears and `copper` inner-ear scoops (`y ~ 0.09..0.28`). Tagged with calm roost `swing` from `[0, 0.86, 0]` so wall props never flap mid-air.
  - `prop.bat_flying` (`category: 'prop'`, `tags: ['hover']`) is sculpted in canonical screen-right (`SCREEN_RIGHT = -1`, world `-x`) 3/4 flight profile with a wide ~`1.3`-unit 3-scallop wingspan (`w:h ~ 2.1:1`) around a compact `pcbBlue` body and `plastic` fur ruff, plus a rounded `solder` head, upturned snout with `copper` nose tip and `paper` fang, twin widely-separated pointed `solder`+`copper` ears, trailing pointed tail and `copper` feet, and zero camera-facing eyes.
- **Two-part articulated 12 fps cartoon wings on flat sibling meshes (follows Req 3 & Decision Q5).**
  - Because `buildModel` (`src/procgen/runtime/build.ts`) instantiates each `PartSpec` as a sibling `THREE.Mesh` under `model.group`, articulating an inner wing and outer 3-scallop wingtip without detaching (`FLOATING_PART` or `ANIM_PIVOT_DETACHED` in `src/procgen/anim/validate-part.ts`) uses a shared shoulder hinge `pivot` (`S`) with overlapping elbow geometry and phase/amplitude whip:
    - Near wing (`z < 0`) and 3/4-offset far wing (`z > 0`) each place `wing.*.inner` *in front* of `wing.*.outer` (`>= 0.024` z-step to avoid `COPLANAR_ZFIGHT`) along the curved thumb-peak-to-scallop finger-bone so the inner wing's ink outline draws the natural comic wing rib, while `wing.*.outer` overlaps behind it and adds a slim curved `plastic` leading-arch sheen crescent.
    - Both inner and outer parts hinge on `S` (`limbPivotGaps` measures `0` gap because the inner wing contains `S`), with `speed: 2.2`, inner `amp` `-0.28`/`+0.24`, and outer `amp` `-0.44`/`+0.36` at `phase: 0.07` lag so wings snap into a wide V on upstroke and a crisp downward clap without folding vertically or covering the head.
    - All non-wing body/head/ear/foot parts share one `recoilBob` (`{ type: 'bob', axis: 'y', speed: 2.2, amp: 0.028, phase: 0 }`), satisfying `checkBob` (`!alone`) and popping the body up as wings clap down (`hoverBob: { amp: 0.028, speed: 2.2 }` passed in `stage-bats.ts` so wing parts ride the same recoil offset).
- **Dark-room-readable comic night palette & 60/30/10 shares (follows Req 1, 2, 7 & Decision Q1).**
  - Both models stay strictly inside `hardware` + `neutral` zones (`0` `human` zones, `0` `malware` zones, `0` `signal` lights, `4` hardware zones `<= 5`): `solder` (`0xadb5bd`) carries the outer wing/head/ear silhouette (~55–70%) so under dark stage lighting (`uLampDark = 1` -> `* vec3(0.34, 0.36, 0.52)` in `src/shaders/comic-material.ts`) the bats render in high-contrast comic twilight slate-blue `#3b4162` against `#0d0b18` dark walls, paired with `pcbBlue` (`0x1d4e89`) for the furry chest, `plastic` (`0xd9d2c5`) for the fur ruff and wing highlights, `copper` (`0xc8763a`) for inner-ear scoops/claws/feet, and neutral `paper` for the tiny side fang. `tex.pcb-black` is intentionally omitted (`prop.gpu_server` keeps it active for `asset-usage.mjs`). Thin highlights set `outline: false`.
- **Exact travel-aligned mirror + tangent pitch in `stage-bats.ts` (follows Req 4 & Decision Q2).**
  - World `+x` is screen-left and `-x` is screen-right (`src/procgen/kit/shapes.ts`). `FLIGHT_SCALE = 1.25` scales the wide `1.3`-unit flying bat to ~67–124 px in `/play`. Since `prop.bat_flying` faces `-x` at `scale.x > 0`:
    - Let `dx = ahead.x - at.x`, `dy = ahead.y - at.y`. Track `facingLeft: boolean` on `FlyingBat` (updated whenever `|dx| > 1e-5`, initialised from `flight.p3.x > flight.p0.x`).
    - Set `g.scale.set(facingLeft ? -size : size, size, size)`. Three.js flips front-face winding automatically when `matrixWorld.determinant() < 0`, and `compensateInkOutlines(g)` uses `Math.abs` world scale; track `lastScaleKey` (`${facingLeft ? '-' : '+'}${size.toFixed(4)}`) so outlines re-compensate on scale or flip changes.
    - Compute `pitch = THREE.MathUtils.clamp(Math.atan2(dy, Math.max(1e-5, Math.abs(dx))), -0.65, 0.65)` and set `g.rotation.z = facingLeft ? pitch : -pitch`. Under `M = T * R_z * S`, local nose `(-1, 0, 0)` maps parallel to `(dx, dy)` in all four diagonal quadrants while preventing overly steep vertical pitching on tight S-bends.
- **ElevenLabs `bat_wings` SFX & flock burst scheduling (follows Req 5, 6 & Decision Q4).**
  - Row `151` (`bat_wings`, `0.9s`) in `docs/audio/SFX_LIST.md`: close-miked cartoon foley of fast leathery bat wing claps — rapid crisp snaps and tight airy flutters of 5–6 quick wingbeats accelerating past and trailing into silence (`<= 450` chars, generated at `0.9s` via `node scripts/harness/audio-gen.mjs plan bat_wings --generate`).
  - `BatsState` tracks per-flock audio flags (`entryCueSent: boolean`, `secondCueSent: boolean`, `flockSize: number`, reset in `spawnFlock` and `clearBats`). In `stepBats`, when `visibleCount` transitions `>= 1` (`!entryCueSent`), emit `{ kind: 'sfx', cue: 'bat_wings' }` on `stage.audioBus` and mark `entryCueSent = true`. When `flockSize >= 4`, `!secondCueSent`, and `visibleCount >= Math.ceil(flockSize / 2)` (a staggered trailing bat crosses `age >= 0`, or `0.28s` after entry if delays cluster), emit `{ kind: 'sfx', cue: 'bat_wings' }` once more and mark `secondCueSent = true`.
  - Registering `KEY_VARIANTS.bat_wings = ['bat_wings']` in `src/audio/config.ts` reuses `nextPlayStyle`'s deterministic rate/gain table (`KEY_RATES` / `KEY_GAINS`) so the second burst and consecutive flocks vary subtly in pitch and level without consuming typing voice caps (`TYPING_SFX` is untouched).

## Layers and gates

- **Inward layers (`scripts/quality/check-layers.mjs`):** Unchanged. `contracts` (`audio-cues.ts`) <- `audio` (`config.ts`, `sfx-app.ts`); `procgen` (`kiroween.ts`, `props.ts`) <- `renderer` (`stage-bats.ts`, using existing `stage.audioBus` of type `AppBus` from `contracts`). Zero new `src/<area>/` directories, zero HTML pages, zero chapter/comix vocabulary changes.
- **Terminal Lab palette (`src/terminal-lab/catalog.ts`):** `paletteGroups()` and `expectedPaletteIds()` read `ModelCatalog.list('prop')` dynamically, so `prop.bat_flying` appears automatically in `/terminal-lab` with zero manual table edits; verify with `terminal-lab-unit.mjs`.
- **Asset & audio gates:**
  - `node .kiro/skills/model-geometry-validator/scripts/validate-model.mjs --all --strict --seeds 8`
  - `node .kiro/skills/procedural-animation-3d/scripts/check-tags.mjs --all`
  - `node scripts/harness/asset-usage.mjs`
  - `npm run quality:fingerprint` (intentional hash update on `prop.bat` and new `prop.bat_flying` row; all other models, textures, and FX byte-identical)
  - `node scripts/harness/audio-gen.mjs --check`, `node scripts/harness/audio-gen.mjs inspect bat_wings`, `node scripts/harness/audio-unit.mjs`, `node scripts/harness/audio-lab-unit.mjs`
  - `node scripts/harness/architecture-unit.mjs`, `node scripts/harness/terminal-lab-unit.mjs`, `node scripts/harness/generate-chapter.mjs --verify`, `npm run quality`, `npm run build`
