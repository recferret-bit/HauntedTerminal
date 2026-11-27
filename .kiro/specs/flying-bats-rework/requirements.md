# Flying bats rework: requirements

Status: done (implemented and verified 2026-11-27)

Capability: Rework the game's bats into plump, expressive comic Halloween bats flying in a clean 3/4 profile with glowing comic eyes, snappy 12 fps cartoon wing articulation, and a fast cartoon wing-claps sound effect when a flock crosses the stage. Room wall props (`prop.bat`) become an upside-down perched cartoon bat with folded scalloped wings and glowing `powerAmber` eyes lined in `ink` in 3/4 alignment, while flying stage flocks (`src/renderer/stage-bats.ts`) use a dedicated `prop.bat_flying` model sculpted in a side / 3/4 flight profile with glowing `powerAmber` 3/4 eyes lined in `ink`, oriented head-first along its cubic Bézier flight tangent, and accompanied by a new ElevenLabs `bat_wings` SFX cue on flock entry.

## What exists today (read from the code, 2026-11-27)

- `src/procgen/archetypes/props/kiroween.ts` & `src/procgen/archetypes/props.ts`: `prop.bat` is a 10-part front-facing blocky PCB model (`kitBox` torso, tiny triangle ears, two `powerAmber` LED eyes facing `-z` straight at the camera, and two single-piece angular `pcbBlack` plates swinging on `z`), shared by both static room wall props (`chapters/chapter-01-kiroween/levels/level-{02,03,06,08,10}*/level.spec.json`, `src/game/view-layouts.ts`) and flying stage flocks (`src/renderer/stage-bats.ts`).
- `src/renderer/stage-bats.ts`: `placeBat` scales `prop.bat` by `FLIGHT_SCALE = 2.6` and clamps `rotation.z` to `[-0.5, 0.5]` with no horizontal mirror (`scale.x` stays positive) so the bat stares front-on at the player even while flying diagonally across the screen.
- `src/renderer/stage-bats.ts`, `src/contracts/audio-cues.ts`, `src/audio/`, `docs/audio/SFX_LIST.md`: Flying flocks emit no audio event onto `stage.audioBus`, and no bat wing-clap SFX cue exists in the catalog or manifest.

## Requirements

1. **Perched cartoon wall bat (`prop.bat`):**
   WHEN `prop.bat` is built (`src/procgen/archetypes/props/kiroween.ts`), THE SYSTEM SHALL render a plump comic Halloween bat hanging upside-down in a folded/perched roost pose (`category: 'prop'`, `tags: ['hover', 'wall']`), featuring a rounded dark body, big pointed ears, wrapped curved cartoon wing folds with bold struts and subtle pale/copper (`solder`, `heatsink`, `copper`, `gold`) comic rim highlights so the silhouette pops against dark room backdrops, tiny claws gripping above, a gentle roost idle (`breathe` / subtle sway, no mid-air flapping), and a tucked/turned 3/4 head with glowing `powerAmber` cartoon eyes lined in `ink` (`eye.l`/`eye.r`, zero `malware` or `human` eye zones) rigidly synced to the head roost animation.

2. **Dedicated flying cartoon bat (`prop.bat_flying`):**
   WHEN `prop.bat_flying` is built and registered in `ModelCatalog` (`category: 'prop'`, `tags: ['hover']`), THE SYSTEM SHALL render a plump comic Halloween bat sculpted in a side / 3/4 flight profile facing along one canonical horizontal travel direction, with a rounded body and head, oversized pointed ears, upturned snout silhouette, glowing `powerAmber` 3/4 cartoon eyes lined in `ink` (`eye.near`/`eye.far`, zero `malware` or `human` eye zones) rigidly synced to the head `recoilBob`, tiny tucked trailing feet, classic 3-scallop curved cartoon wings with bold rib struts, and subtle pale/copper comic rim highlights that read clearly at game scale (`58 px/unit`) against dark backdrops.

3. **Two-part articulated 12 fps cartoon wing flap and body recoil:**
   WHEN `prop.bat_flying` is animated via `createAnimator` (`src/procgen/anim`), THE SYSTEM SHALL drive a two-part articulated cartoon wing flap on the 12 fps stepped comic clock — swinging each inner wing arm (`swing`) and whipping its outer 3-scallop wingtip (`swing` with a slight phase lag) across a wide upstroke/downstroke arc paired with a subtle body recoil (`bob`) on each clap.

4. **Travel-aligned stage orientation (never looking at the player):**
   WHEN a stage flock flies in `src/renderer/stage-bats.ts`, THE SYSTEM SHALL build `prop.bat_flying`, mirror each bat horizontally (`scale.x` sign with `compensateInkOutlines` preserved under non-uniform sign flip) to face its horizontal travel direction (`ahead.x` vs `at.x`), and pitch `rotation.z` along its instantaneous cubic Bézier tangent (`atan2(dy, |dx|)`) so the bat's head and body always point along its flight path and never face the player.

5. **ElevenLabs `bat_wings` fast wing-claps SFX cue:**
   THE SYSTEM SHALL add row `bat_wings` to `docs/audio/SFX_LIST.md` describing fast, punchy cartoon bat wing claps, generate `public/sfx/bat_wings.mp3` and update `public/sfx/manifest.json` exclusively through `node scripts/harness/audio-gen.mjs plan bat_wings --generate` (honouring the 15,000-credit run cap and 30,000-credit reserve), register `'bat_wings'` in `src/contracts/audio-cues.ts` (`SFX_IDS`, in manifest order), and map it in `src/audio/` so `audio-gen.mjs --check` and `audio-unit.mjs` pass.

6. **Flock wing-clap trigger, large-flock stagger, and pause/reduced-motion silence:**
   WHEN a stage flock enters the view in `src/renderer/stage-bats.ts`, THE SYSTEM SHALL emit `bat_wings` onto `stage.audioBus` (`{ kind: 'sfx', cue: 'bat_wings' }`) once as the first bat in the flock becomes visible (`age >= 0`), AND IF the flock contains 4 or more bats, THE SYSTEM SHALL emit one staggered second `bat_wings` burst as a trailing bat enters (`age >= 0`); WHILE `stage.stormPaused`, `stage.devNoStorm`, `!bats.enabled`, or `stage.reducedMotion.on` holds, THE SYSTEM SHALL NOT spawn flocks, advance flights, or emit `bat_wings`.

7. **Validators, architecture, and playthrough gates:**
   THE SYSTEM SHALL satisfy `credits-art-direction` and `MODEL_RULES` across seeds (`validate-model.mjs --all --strict --seeds 8`, `check-tags.mjs --all`, `asset-usage.mjs`, zero `human` or `malware` zones on `prop.*`), keep every file `<= 600` lines and function `<= 130` lines with `0` clones, `0` cycles, and `0` dead exports (`npm run quality`), preserve 0-death headless chapter verification (`generate-chapter.mjs --verify`), and document intentional `prop.bat` and `prop.bat_flying` hash changes via `npm run quality:fingerprint`.

## Out of scope

- Turning bats into targetable `RoomView` actors or letting bats affect turn-based battles, damage, or the 30-second turn timer (bats remain decoration only).
- Changing existing `prop.bat` placements in `chapters/` JSON files or `src/game/view-layouts.ts` (they automatically inherit the perched cartoon `prop.bat`).
- Continuous looping wing audio (`bat_wings_loop`) or per-wingbeat one-shot spam on every flap frame.
- Extra Three.js lights, shadow maps, bloom, smooth 60 fps interpolation, or external tween libraries.

## Decisions

- **Q1:** What cartoon visual style should replace the current blocky PCB bat?
  **A (user, 2026-11-27):** Plump comic Halloween bat — rounded body, big pointed ears, classic 3-scallop curved cartoon wings with bold struts, and subtle pale/copper rim highlights so it pops on dark backdrops `(Recommended)`.
- **Q2:** How should the bat be oriented so it does not look at the player?
  **A (user, 2026-11-27):** Side / 3/4 flight profile with zero camera-facing eyes — sculpted facing along its travel direction (flipped left/right and pitched along the Bézier curve) so its head points where it flies, never at the player `(Recommended)`.
- **Q3:** How should we handle room wall bat props (`prop.bat` in levels) vs. the flying stage flocks?
  **A (user, 2026-11-27):** Rework `prop.bat` into a perched upside-down cartoon bat (head tucked away) AND add a dedicated flying cartoon bat model (`prop.bat_flying`) for stage flocks — both places look right for their role `(Recommended)`.
- **Q4:** How should the fast wing-claps sound effect be generated and played?
  **A (user, 2026-11-27):** Generate a new ElevenLabs SFX cue (`bat_wings`) via `audio-gen.mjs` with fast, punchy cartoon wing claps, triggered as the flock enters the view (plus a staggered second burst on larger flocks), paused/muted when stage is paused or reduced-motion is on — lively without drowning out combat or dialog `(Recommended)`.
- **Q5:** How should the cartoon wings animate in flight?
  **A (user, 2026-11-27):** Two-part articulated cartoon wing flap at 12 fps (inner wing + outer scalloped tip whipping with slight phase lag and body recoil on each clap) — extra-expressive cartoon snap at low triangle cost `(Recommended)`.

- **Q6:** How should the bats' glowing cartoon eyes be built so they fit the art palette, stage lighting, and 3/4 flight/roost silhouettes?
  **A (user, 2026-11-27):** Add glowing eyes to the bats using `powerAmber` (`0xffd166`, `emissive: 0.6`, exempt `signal` zone) plates framed by slightly larger `ink` (`0x110e1b`) comic liner rims (`outline: false`) in 3/4 alignment on `head` (`eye.l`/`eye.r` tagged `roostSway` on `prop.bat`; `eye.near`/`eye.far` tagged `recoilBob` on `prop.bat_flying`), preserving `0` malware/human zones and `4` hardware zones.

## Open questions

(none)

## Verification

| Requirement | Gate |
|---|---|
| 1, 2, 3, 7 | `node .kiro/skills/model-geometry-validator/scripts/validate-model.mjs --all --strict --seeds 8`, `node .kiro/skills/procedural-animation-3d/scripts/check-tags.mjs --all`, `node scripts/harness/asset-usage.mjs`, `node scripts/harness/render-sheet.mjs prop.bat prop.bat_flying --views`, `npm run quality:fingerprint` |
| 4, 6 | `node scripts/harness/architecture-unit.mjs` (unit tests for `prop.bat_flying` travel heading/flip, zero front-facing orientation, flock entry + 4+-bat staggered `bat_wings` emission, and pause/reduced-motion silence), `node scripts/harness/screenshot-lab.mjs` |
| 5, 6 | `node scripts/harness/audio-gen.mjs --check`, `node scripts/harness/audio-gen.mjs inspect bat_wings`, `node scripts/harness/audio-unit.mjs`, `node scripts/harness/audio-lab-unit.mjs` |
| 7 | `node scripts/quality/check-specs.mjs`, `node scripts/harness/generate-chapter.mjs --verify`, `npm run quality`, `npm run build` |
