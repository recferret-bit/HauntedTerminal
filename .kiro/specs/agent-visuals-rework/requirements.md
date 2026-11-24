# Parody Agent Visuals, Shaders & Particles Rework: requirements

Status: done (implemented and verified 2026-11-24)

Capability: Rework all four parody AI-agent villains (`agent.clod`, `agent.antigravy`, `agent.gork`, `agent.codec`) with distinct, non-logo comic silhouettes, multi-part stepped animations (`12 fps`), stepped cel-comic material shaders, comic particle presets (`FxCatalog`), animated multi-frame corner dialog portraits (`portrait.ts` / `dialog-box.ts`), and refreshed static comic renders.

## Requirements

1. WHEN `agent.clod` is built and animated, THE SYSTEM SHALL render a sculpted `clayOrange` clay crab-golem torso with glowing stepped crack seams, articulated snapping pincer arms (`swing`), torso `breathe`, blinking tired eyelid/eye (`malwareEye`), corruption `jitter`, and a dedicated acting sheet in `ANIM_MALWARE_ACTING`.
2. WHEN `agent.antigravy` is built and animated, THE SYSTEM SHALL render a recognizable ceramic coffee mug (`gravyBlue` + `paper` rim band) holding visible dark-roast brew (`gravyBrown` + crema accent), driven by a stepped cel-comic swirling-brew and rising heat-wave shader (`12 fps` stepped, zero smooth gradients), upward-drifting steam curls and levitating subagent coffee droplets (`bob`/`orbit`), and a comic coffee/steam `FxPreset`.
3. WHEN `agent.gork` is built and animated, THE SYSTEM SHALL render an event-horizon black-hole planet head (`gorkBlack` core) separated by a clear open gap from its high-contrast stepped accretion-ring circles (`accretion_halo`) so both the planet body and rings read distinctly at game scale (`58 px/unit`), wearing chunky silver-rimmed comic goggles (`solder` frames, `ink` wells, glowing `malwareEye` cores), a bold `paper`-white upturned comic smile, orbiting asteroid shards (`orbit` + `spin`), `jitter` corruption, and a comic `FxPreset`.
4. WHEN `agent.codec` is built and animated, THE SYSTEM SHALL render a chunky retro CRT terminal-head bot (`codecSteel` + `codecNavy`) featuring a clean dark CRT glass screen (`crt_code`, with no moving code lines or scanlines) behind only a bold `paper` `>` prompt and blinking `malwareEye` `_` cursor, swinging `{` and `}` curly-brace mechanical claw arms (`swing`), `jitter` corruption, and a syntax-shard comic `FxPreset`.
5. WHEN custom per-part stepped comic shader variants (molten clay cracks, swirling hot coffee/heat, accretion vortex halo, dark CRT `>_` screen) are rendered in Three.js or rasterized in CPU software previews (`rasterizeModel`, `drawPortrait`, `render-sheet.mjs`), THE SYSTEM SHALL keep `COMIC_FRAG` cel bands (`1.0 / 0.68 / 0.4`), ink outlines (`#110e1b`), and `ZONES` palette colours intact while providing deterministic software textures/shades so CPU portraits and contact sheets remain readable.
6. WHEN an agent taunt or dialog box appears on the play screen (`src/ui/dialog-box.ts` + `src/renderer/portrait.ts`), THE SYSTEM SHALL cycle stepped multi-frame rasters driven by the model's `AnimTag` poses (including steam curls, floating droplets, claws, halos, and CRT cursors), and WHEN agents appear in 3D play stages (`src/renderer/`), 3D comix (`src/cinematic/`), or `/storybook.html`, THE SYSTEM SHALL animate their shaders, parts, and `FxCatalog` particle cues.
7. WHEN static chapter story pages (`chapters/chapter-01-kiroween/story/comix.spec.json`) are rendered to `public/comix/chapter-01-kiroween/`, THE SYSTEM SHALL regenerate the comic PNGs with the reworked `agent.*` models and explain all intentional model, texture, and FX hash diffs in `npm run quality:fingerprint`.
8. IF any reworked model, animation tag, shader patch, or particle preset violates budget, grounding, contact, silhouette (`minHullDeficit >= 0.1`), palette family, single-focal-eye, asset-usage, or stepped-timing rules, THEN `validate-model.mjs --all --strict`, `check-tags.mjs --all`, `validate-particles.mjs --all`, `check-examples.mjs`, `asset-usage.mjs`, and `npm run quality` SHALL fail until resolved.

## Out of scope

- Tracing or adapting third-party AI company logos or using real AI brand names (`npm run quality:brands` remains strictly enforced).
- Changing chapter puzzle mechanics, VFS layouts, or `solutionCommands`.
- Adding extra Three.js scene lights, shadow maps, bloom, or smooth 60fps alpha-smoke gradients.

## Decisions

- **Q:** Should the four villain agents use reworked corporate brand icons or reworked original parody characters?
  **A (user, 2026-11-24):** Rework the current parody agent visuals (`Clod`, `Anti-Gravy`, `Gork`, `Codec`) rather than using real company icons: make `Clod` animated and expressive instead of a boring static pile; keep `Anti-Gravy`'s recognizable coffee-cup read and add real coffee, heat animation, shaders, and particles; fully rework `Gork` and `Codec` into recognizable silhouettes.
- **Q:** How far should `Clod`'s (`agent.clod`) visual and animation rework go?
  **A (user, 2026-11-24):** Sculpted clay crab-golem + full stepped rig + glowing crack seams — keeps recognizable clay & pincers while adding breathing torso, snapping claws, blinking eye, and boss acting sheet; slightly taller silhouette.
- **Q:** How should `Anti-Gravy`'s (`agent.antigravy`) coffee, heat shader, and particles look?
  **A (user, 2026-11-24):** Ceramic coffee mug + stepped brew/heat-wave shader + upward coffee/steam particles — unmistakable hot mug silhouette with swirling dark-roast cel shader, rising steam curls, and floating subagent coffee drops; replaces boat spout with mug rim/handle.
- **Q:** Which character concept should replace `Gork` (`agent.gork`)?
  **A (user, 2026-11-24):** Event-horizon black-hole head in aviator shades + bright accretion vortex shader — dark core framed by a high-contrast stepped accretion halo so it pops off dark floors, reflective sunglasses (1 glowing `malwareEye` lens), neon smirk, and orbiting shards.
- **Q:** Which character concept should replace `Codec` (`agent.codec`)?
  **A (user, 2026-11-24):** Retro CRT terminal-head bot with scrolling `>_` screen shader & `{ }` claw arms — chunky steel/navy monitor head with animated stepped code lines + blinking cursor eye, swinging curly-brace arms, and syntax-shard particles; clear at 64px.
- **Q:** Where should the new animations, shaders, and particles be active?
  **A (user, 2026-11-24):** Everywhere: 3D stage/comix/Storybook + multi-frame animated DOM portraits/cameos + re-rendered chapter comic PNGs — wires stepped multi-frame animation and FX cues across `procgen`, `shaders`, `renderer`, `cinematic`, and `public/comix/`.
- **Q:** Follow-up visual readability pass on `agent.gork` and `agent.codec` under the pixel-art shader?
  **A (user, 2026-11-24):** Add a clear visual gap between `agent.gork`'s planet body and its surrounding planet ring circles, make Gork's goggles and smile clearly recognizable through the pixel-art shader, and remove the moving monitor lines from `agent.codec` so only the `>_` symbols remain.

## Open questions

(none)

## Verification

| Requirement | Gate |
|---|---|
| 1, 2, 3, 4, 8 | `node .kiro/skills/model-geometry-validator/scripts/validate-model.mjs --all --strict`, `node .kiro/skills/procedural-animation-3d/scripts/check-tags.mjs --all`, `node .kiro/skills/particle-effect-validator/scripts/validate-particles.mjs --all`, `node scripts/harness/asset-usage.mjs` |
| 2, 3, 4, 5 | `node .kiro/skills/shader-texture-tuning/scripts/check-examples.mjs`, `node scripts/harness/screenshot-lab.mjs --selftest` |
| 6, 7 | `node scripts/harness/terminal-lab-unit.mjs`, `node scripts/harness/generate-comix.mjs --verify`, `node .kiro/skills/comix-implementer/scripts/verify-comix.mjs`, `node .kiro/skills/chapter-implementer/scripts/verify-chapter.mjs`, `npm run quality:fingerprint` |
| 8 | `npm run quality`, `npm run build` |
