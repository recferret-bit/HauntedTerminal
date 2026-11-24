# Terminal Matrix feedback: design

## Pieces

New or changed files, grouped by the agent that owns them (`team-rules.md`).

```
artist              src/procgen/core/palette.ts          adds pure Matrix green zones (matrixBright #00e82b, matrixGlow #6dff86, matrixDark #006b1b)
                    src/procgen/fx/types.ts              FxMoment gains 'matrix-cast'; FxEmissionKind gains 'orbit'; FxLayer gains shapes/orbit/glyphSwapSteps; FxPreset gains wrapActor; FxParticleState gains rotX/rotY/shapeIndex
                    src/procgen/fx/shapes.ts             fxMatrixGlyph / fxMatrixGlyphSet (8 slender Matrix Katakana & digital-rain 3D relief glyphs)
                    src/procgen/fx/simulate.ts           rollOrbitPattern / spawnOrbitLayer / evalOrbit (coherent per-seed random 3D swirl direction, phase, tilt, depth scale, 3D yaw, glyph flicker)
                    src/procgen/fx/validate-{layers,preset}.ts  validates 'orbit' emission and layer.shapes pools
                    src/procgen/fx/preview.ts            3D rotY projection and behind/in-front actor ghost layering for wrapActor
                    src/procgen/fx/catalog.ts            FX_MOMENT_WORDS['matrix-cast'] = null
                    src/procgen/fx/presets.ts            registers 'fx.matrix-cast' (3D 3-stream helical Matrix vortex, 15 fps, 680 ms, wrapActor: true)
                    src/procgen/runtime/fx-emitter/layers.ts  supports multi-shape pools (shapeIndex) and 3D rotX/rotY transforms
                    src/renderer/fx-player.ts            FX_IDS gains 'fx.matrix-cast'; wrapActor 3D z-axis placement; hero follow tracking; per-command random seed
                    src/renderer/event-fx.ts             FxAnchor gains 'vibecoder-body'; fxCuesFor('VIBECODER_ACTION') returns [cue('fx.matrix-cast', 'vibecoder-body', 0)]
                    src/renderer/stage-resolve.ts        resolves 'vibecoder-body' to hero spine center (ACTOR_Z)
                    src/renderer/stage-fx.ts             passes hero group as follow target for 'vibecoder-body'
                    src/renderer/stage-motion.ts         heroAction untargeted branch plays hopInPlace(stage, hero, 0.16, 220)
                    src/renderer/stage-selfcheck.ts      doc comment updated for 24 presets
                    .kiro/skills/procedural-particles-3d/references/preset-catalog.md  documents fx.matrix-cast
                    .kiro/skills/haunted-art-direction/SKILL.md  documents Matrix palette zones
                    .kiro/skills/particle-effect-validator/scripts/self-test.mjs  adds 'orbit without a radius' test case
chapters-designer   src/chapters/session-flow.ts         exec() emits a fallback VIBECODER_ACTION { action: 'type', command: typed } when a non-empty command did not already emit one
                    scripts/harness/props/gameplay.mjs   property: every non-empty command in a chapter session emits at least one VIBECODER_ACTION
lead-dev            .kiro/specs/terminal-matrix-feedback/{requirements,design,tasks}.md
```

## Decisions

- **Every non-empty command emits `VIBECODER_ACTION` in both shells.** Classic `Game.exec` (`src/game/session.ts`) already unshifts `VIBECODER_ACTION` on every non-empty command. `DeclarativeChapterGame` (`src/chapters/session-flow.ts` `exec`) previously relied on individual command handlers to push `VIBECODER_ACTION`, leaving commands like `echo`, `whoami`, `help`, `man`, `status`, `hank`, `grep`, `find`, `touch`, `mkdir`, `cp`, `mv` (non-pickup), `ps`, and unknown commands without one. In `session-flow.ts` `exec`, if `step.events` does not already contain a `VIBECODER_ACTION`, insert `{ type: 'VIBECODER_ACTION', action: 'type', command: typed }` right after `arrivalEvents`.
- **Untargeted `heroAction` hops in place.** In `src/renderer/stage-motion.ts`, `heroAction` replaces the 2-pose `-0.02` downward nod with `hopInPlace(stage, hero, 0.16, 220)` while preserving the `action === 'cast' || action === 'write'` attack state trigger and preserving the targeted walk-up + hop/strike + walk-back sequence.
- **Pure Matrix green palette zones.** Existing `phosphor` (`#39ff88`, emissive `0.6`) has high blue that clips green and shifts mint-cyan under `COMIC_FRAG`. Adding `matrixBright` (`#00e82b`, `signal`, emissive `0.35`), `matrixGlow` (`#6dff86`, `signal`, emissive `0.45`), and `matrixDark` (`#006b1b`, `hardware`, emissive `0.08`) produces authentic Matrix digital-rain green with strong CIE76 separation and leaves all 23 existing presets and 59 models byte-identical.
- **True 3D orbital swirl (`emit: 'orbit'`, `wrapActor: true`) with per-command randomization.**
  - Family: `'system'`, anchor: `'center'`, `wrapActor: true`, `durationMs: 680`, `stepFps: 15`, no `shake`, no `flash`, no `onomatopoeia` (`FX_MOMENT_WORDS['matrix-cast'] = null`).
  - Each emission rolls one coherent 3D gesture (`dir: ±1` clockwise/counter-clockwise, `basePhase ∈ [0, 360°)`, `tilt ∈ [-20°, +20°]`, subtle radius/height spread) shared by all 3 helical streams (`head` in `matrixGlow`, `stream` in `matrixBright`, `trail` in `matrixDark`).
  - Glyphs orbit at `rx ≈ 0.62..0.88`, `rz ≈ 0.44..0.48` centered on the vibecoder's 3D spine (`ACTOR_Z = 0.22`): front half (`world z ≈ -0.22`) sweeps in front of his face/lantern at `1.24×` perspective scale; back half (`world z ≈ +0.66`) passes behind his torso/hood (real WebGL depth occlusion) while staying well in front of the room wall (`world z = 1.12`); sides yaw `±49°` around Y showing extruded 3D beveled edges.
  - Each particle selects from 8 slender Katakana/digital-rain 3D glyphs (`fxMatrixGlyph`: `'fu'`, `'ko'`, `'hi'`, `'te'`, `'re'`, `'se'`, `'yo'`, `'one'`) and flickers characters every 2–3 stepped frames (`glyphSwapSteps`).
  - `FxPlayer.play` derives a fresh seed using `Math.random()` (random in live play, deterministic under `visual-audit`'s seeded `Math.random()`) and tracks `hero.group` while alive so the vortex rides the vibecoder's hop or walk.

## Layers and gates

- No new `src/<area>/` or `pages/*.html`; `scripts/quality/check-layers.mjs` is unchanged.
- No chapter/comix/lab vocabulary change.
- Asset fingerprint (`npm run quality:fingerprint`) gains one line: `fx      fx.matrix-cast ...`, while all existing model, texture, and FX lines remain byte-identical.
- Gates: `node scripts/quality/check-specs.mjs`, `npm run procgen:fx -- --sheet`, `npm run procgen:selftest`, `node scripts/harness/asset-usage.mjs`, `node scripts/harness/generate-chapter.mjs --verify`, `node scripts/harness/terminal-lab-unit.mjs`, `node scripts/harness/terminal-lab.mjs --all`, `node scripts/harness/property-tests.mjs`, `npm run quality:fingerprint`, `npm run quality`.
