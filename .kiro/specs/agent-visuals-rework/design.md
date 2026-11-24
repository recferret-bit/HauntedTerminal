# Parody Agent Visuals, Shaders & Particles Rework: design

## Pieces

```
src/procgen/core/
  types.ts                        adds optional `shader?: ComicSurfaceShader` on `PartSpec` (`clay_cracks | coffee_heat | accretion_halo | crt_code`)
src/shaders/
  comic-variants.ts               `patchComicFragment`, `comicVariant`, and the 4 stepped `12 fps` GLSL surface patches (`three` + `./comic-material.js` only)
src/procgen/textures/
  decals.ts                       registers palette-locked static fallback textures (`tex.clay_cracks`, `tex.coffee_brew`, `tex.accretion_halo`, `tex.crt_code`) for CPU rasters
src/procgen/runtime/
  build.ts                        wraps parts declaring `part.shader` in `comicVariant` with `ZONES` uniform colours and tracks them in `BuiltModel.allMaterials`
src/procgen/archetypes/agents/
  cast.ts                         barrel registering the four reworked `agent.*` archetypes
  shapes.ts                       shared 2D relief outline helpers (mug rim/handle, crab pincer, curly-brace limb, accretion ring, CRT bezel)
  clod.ts                         `agent.clod`: sculpted `clayOrange` crab-golem torso, `clay_cracks` seams, snapping pincers, blinking tired lid + `malwareEye`
  antigravy.ts                    `agent.antigravy`: `gravyBlue` ceramic coffee mug, `coffee_heat` dark-roast brew + crema, rising steam curls & subagent droplets
  gork.ts                         `agent.gork`: `gorkBlack` event-horizon planet core separated by an open gap from `accretion_halo` rings, chunky silver-rimmed goggles, bold `paper` smile, orbiting shards
  codec.ts                        `agent.codec`: `codecSteel`/`codecNavy` retro CRT monitor-head bot, clean dark `crt_code` glass screen + `>_` `malwareEye` prompt, `{ }` claw arms
src/procgen/anim/
  acting.ts                       adds `ANIM_MALWARE_ACTING` sheets for `agent.clod` (and agent cast) with stepped anticipation/strike/recover poses
src/procgen/fx/
  types.ts, catalog.ts            adds `FxMoment` / `FX_MOMENT_WORDS` entries for the four agent signature effects
  presets.ts, presets-agents.ts   authors 4 stepped `12 fps` `malware`-family presets (`fx.agent-clod`, `fx.agent-coffee`, `fx.agent-gork`, `fx.agent-codec`)
src/renderer/
  event-fx.ts, stage-frame.ts     emits matching `fx.agent-*` cues on `AGENT_TAUNT` and periodic ambient bursts on live `agent.*` stage actors (e.g. Boss room & Coffee steam)
  portrait.ts                     extends head/look regexes and vertical-bob allowance (`/drop|bit|steam|shard|block/i`) for crisp 4-frame `64px` corner dialog animation
comix/
  intro/pages/**, outro/**        fires `fx.agent-*` particle beats on agent awakenings/taunts and frames reworked agents inside `reverse_storm`; recompiled to `src/cinematic/generated/catalog-data.ts`
public/comix/chapter-01-kiroween/
  page-*.png                      regenerated static chapter comic pages via `comix-story-drawer`
.kiro/skills/
  credits-art-direction/references/world-lexicon.md   updates the four `agent.*` silhouette briefs
  shader-texture-tuning/scripts/check-examples.mjs    verifies `src/shaders/comic-variants.ts` anchors, braces, uniforms, and cel-band preservation
```

## Decisions

- **Declarative `PartSpec.shader` + patched `COMIC_FRAG` variants (`src/shaders/comic-variants.ts`).** Instead of forking `COMIC_FRAG` or creating standalone unlit shaders that ignore cel bands, ink rims, and lightning flashes, `comic-variants.ts` patches `COMIC_FRAG` at its four stable anchors (`main`, `mapSample`, `rim`, `emissive`, `output`) per `shader-texture-tuning`. `shaders/` accepts hex colors as parameters rather than importing `procgen/`, preserving inward layer rules (`check-layers.mjs`). `build.ts` pushes variant materials into `BuiltModel.allMaterials`, so `ComicStage`, `CinematicStage`, and `Storybook` feed `uTime` and `uFlash` every frame with zero stage boilerplate. Rejected custom `MeshBasicMaterial` / smooth-gradient shaders because they violate `credits-art-direction` and crawl under the pixel-art pass. Follows Decisions 2, 3, 4, and 6 in `requirements.md`.
- **Dual WebGL shader + CPU `TextureCatalog` pairing (`PartSpec.texture` + `PartSpec.shader`).** Because `rasterizeModel`, `drawPortrait`, `render-sheet.mjs`, and `comix-story-drawer` run in CPU Node/Canvas without WebGL, each shaded agent surface also binds a palette-locked `TextureCatalog` decal (`tex.clay_cracks`, `tex.coffee_brew`, `tex.accretion_halo`, `tex.crt_code`). In WebGL, the stepped `12 fps` shader animates UVs and cel-lit surface blocks (`floor(uTime * 12.0)`, `step()`); in CPU rasters, `rasterizeModel` samples the static comic texture so 64px portraits and static comic pages show the same coffee crema, clay cracks, accretion bands, and CRT code lines. Follows Decision 6 in `requirements.md`.
- **Four distinct non-logo silhouettes split into per-agent modules (`clod.ts`, `antigravy.ts`, `gork.ts`, `codec.ts`).**
  - `agent.clod`: taller sculpted clay crab-golem (`y = 0` grounded, `breathe` torso, `clay_cracks` glowing seams, two multi-segment pincer arms sharing shoulder pivots with counter-phased `swing`, heavy `blink`/`swing` tired eyelid over 1 `malwareEye`, `jitter` crown shard) + `ANIM_MALWARE_ACTING['agent.clod']`. Follows Decision 2.
  - `agent.antigravy`: unmistakable `gravyBlue` ceramic coffee mug (`tags: ['hover', 'detached']`, wide cylindrical/extruded cup body, bold C-handle, `paper` rim stripe, tilted elliptical top `brew` plate with `coffee_heat` swirling crema/heat-wave shader, stepped rising `steam` curls + floating `gravyBrown` coffee droplets as subagents, 1 `malwareEye` roast-badge core, `jitter` rim chip). Follows Decision 3.
  - `agent.gork`: `gorkBlack` event-horizon planet head separated by a clear open gap (`r = 0.37` vs `inner = [0.59, 0.33]`) from its concentric `accretion_halo` planetary rings, chunky `solder`-rimmed comic goggles (`ink` lens wells + glowing `malwareEye` cores, `corruptViolet` strap/bridge), wide `paper`-white comic smile, `orbit` + `spin` asteroid bits, and `jitter` flare. Follows Decisions 4 and 7.
  - `agent.codec`: chunky retro CRT monitor-head bot (`codecSteel` outer shell, `codecNavy` deep bezel, clean dark `crt_code` recessed CRT glass screen with zero moving code lines behind only a `paper` `>` prompt and blinking `malwareEye` `_` cursor, left/right `{` and `}` mechanical claw arms with `swing`, `jitter` compression macroblocks). Follows Decisions 5 and 7.
  Splitting `cast.ts` into four files keeps every file `< 220` lines and every function `< 130` lines.
- **Stepped `12 fps` `FxPreset`s wired across stage, comix, and `asset-usage.mjs`.** Four `malware`-family presets in `presets-agents.ts` (`fx.agent-clod`, `fx.agent-coffee`, `fx.agent-gork`, `fx.agent-codec`) emit countable ink-outlined chunks (clay splats, coffee drops + rising steam puffs, accretion sparks, `{}` syntax blocks). `event-fx.ts` triggers the matching preset when `AGENT_TAUNT` fires on stage (anchored to the stage actor if present, or top-right panel corner) and `stage-frame.ts` emits periodic gentle coffee-steam/spark bursts on live `agent.*` stage actors; `comix/intro` and `comix/outro` fire them on agent beats. This satisfies `asset-usage.mjs` (zero unused FX or textures) and keeps particle timing strictly stepped at `12 fps`. Follows Decisions 3 and 6.
- **Animated 4-frame corner portraits (`src/renderer/portrait.ts`).** Since `mountDialogOrchestrator` renders both `DIALOG_BOX` and `AGENT_TAUNT` through `DialogBox` + `drawPortrait` (4 stepped frames at `10 fps`), updating `portrait.ts` part-selection regexes (`claw`, `steam`, `halo`, `screen`, `brace`, `shades`) ensures every play-screen taunt visibly animates claws, rising coffee steam/droplets, orbiting debris, and blinking CRT cursors without cropping off limbs or mug steam. Follows Decision 6.

## Layers and gates

- **Layer rules (`scripts/quality/check-layers.mjs`):** Unchanged. `src/shaders/comic-variants.ts` imports only `three` and `./comic-material.js`; `src/procgen/runtime/build.ts` already imports `procgen/` and `shaders/`; `src/renderer/` already imports `contracts/`, `procgen/`, and `shaders/`.
- **Pages (`vite.config.ts`) & chapter/comix schemas:** Unchanged (no new `src/<area>/`, no new HTML entry pages, no new chapter/comix schema fields — `comix/` uses existing `fx` beat actions).
- **Team ownership (`scripts/harness/agents-build.mjs`):** Every touched source file already has a single owner (`artist` owns `src/{procgen,shaders,renderer}/**`, `comix-designer` owns `comix/**` and `src/cinematic/**`, `chapters-designer` owns `chapters/**`).
- **Asset fingerprints (`npm run quality:fingerprint`):** Expected diffs on `agent.clod`, `agent.antigravy`, `agent.gork`, `agent.codec`, the 4 new `tex.*` decals, and the 4 new `fx.agent-*` presets; all unrelated models, rooms, doors, pickups, items, and malware remain byte-identical.
- **Verification gates:**
  - `node scripts/quality/check-specs.mjs`
  - `node scripts/quality/check-brands.mjs`
  - `node scripts/quality/check-legacy-name.mjs`
  - `node .kiro/skills/model-geometry-validator/scripts/validate-model.mjs --all --strict`
  - `node .kiro/skills/procedural-animation-3d/scripts/check-tags.mjs --all`
  - `node .kiro/skills/particle-effect-validator/scripts/validate-particles.mjs --all`
  - `node .kiro/skills/shader-texture-tuning/scripts/check-examples.mjs`
  - `node scripts/harness/asset-usage.mjs`
  - `node scripts/harness/generate-comix.mjs --verify`
  - `node .kiro/skills/comix-implementer/scripts/verify-comix.mjs`
  - `node .kiro/skills/chapter-implementer/scripts/verify-chapter.mjs`
  - `node scripts/harness/terminal-lab-unit.mjs`
  - `node scripts/harness/screenshot-lab.mjs --selftest`
  - `npm run quality:fingerprint`
  - `npm run quality`
  - `npm run build`
