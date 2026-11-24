# Terminal Matrix feedback: requirements

Status: done (all tasks ticked and gates run 2026-11-22)

Capability: When the player runs any non-empty command in the terminal, the vibecoder hops in place (or walks up and acts on a targeted room actor) while a per-command randomized 3D orbital vortex of Matrix-style digital-rain Katakana/code glyphs in pure Matrix green tones (`matrixBright`, `matrixDark`, `matrixGlow`) swirls around his body (passing both in front of and occluded behind him with 3D yaw and depth scaling), stepped at 15 fps, with no onomatopoeia word banner.

## Requirements

1. WHEN the player submits any non-empty command in a chapter or classic terminal session, THE SYSTEM SHALL emit a `VIBECODER_ACTION` event for that command (using the command's specific action when it already emits one, or action `'type'` otherwise).
2. WHEN the comic stage handles a `VIBECODER_ACTION` event without an in-room target actor, THE SYSTEM SHALL make the vibecoder hop in place (stepped vertical hop tween) instead of the 0.02-unit nod.
3. WHILE the comic stage handles a `VIBECODER_ACTION` event with an in-room target actor, THE SYSTEM SHALL preserve the existing stepped walk-up, target hop/strike pose, and walk-back sequence.
4. WHEN the comic stage handles any `VIBECODER_ACTION` event, THE SYSTEM SHALL play a Matrix-glyph comic effect preset from `FxCatalog` centred on and following the vibecoder's 3D body axis with a fresh per-command random seed so every command varies (swirl handedness, start phase, orbital tilt, glyph picks) while preserving the same swirling orbital pattern.
5. THE SYSTEM SHALL define the Matrix-glyph effect as a declarative `FxPreset` (`fx.matrix-cast`) in `src/procgen/fx/` using slender Matrix Katakana/digital-rain 3D relief glyphs (`fxMatrixGlyph`) in pure Matrix green palette zones (`matrixBright`, `matrixDark`, `matrixGlow`), orbiting in 3D (`emit: 'orbit'`, `wrapActor: true`) with depth scaling, 3D yaw rotation, and stepped character flicker, with no onomatopoeia word (`null` in `FX_MOMENT_WORDS`).
6. THE SYSTEM SHALL pass `validateFxPreset` and `validateFxCatalog` (60/30/10 role area balance, CIE76 colour separation, particle/triangle budgets, stepped timing, extent, no lingering particles) and expose the preset in `/storybook.html?tab=fx`.
7. THE SYSTEM SHALL keep all headless chapter playthroughs at 0 deaths and pass stage self-check, asset-usage check, and property-based tests.

## Out of scope

- Adding an onomatopoeia text popup on every command.
- Changing specific event effects (`fx.hop`, `fx.reveal`, `fx.sigkill`, `fx.gate-open`, etc.) or their words.
- New terminal commands, level specs, or comix sequences.

## Decisions

- **Q:** Which terminal commands should trigger the Matrix symbols and vibecoder jump?
  **A (user, 2026-11-22):** Every non-empty command typed in the terminal (both gameplay and meta/read commands like `ls`, `pwd`, `cat`, `help`, `status`), while specific action events still play their own target effects too (Recommended).
- **Q:** How should the Matrix-like symbols look and move around the vibecoder?
  **A (user, 2026-11-22):** Rising & swirling 3D comic glyphs (`0`, `1`, `>`, `[`, `#`, `/`, `+`) in Matrix phosphor-green and data-cyan around the vibecoder, stepped at 12 fps (Recommended).
- **Q:** Should the Matrix symbol effect include a comic onomatopoeia word above the vibecoder?
  **A (user, 2026-11-22):** No word on the Matrix symbol effect itself, avoiding screen clutter and collisions with event words like `HOP!`, `REVEAL!`, `CLANK!`, or `SIGKILL!` (Recommended).
- **Q:** How should the vibecoder's jump behave when typing a command?
  **A (user, 2026-11-22):** Hop in place on every untargeted command (replacing the tiny 0.02 downward nod), and keep walking + hopping/striking on commands that target an object in the room (Recommended).
- **Q:** Where should the Matrix symbol effect live in the architecture?
  **A (user, 2026-11-22):** A new `FxCatalog` preset in `src/procgen/fx/` (validated by `particle-effect-validator` and inspectable in `/storybook.html?tab=fx`), triggered by `VIBECODER_ACTION` in `src/renderer/` (Recommended).
- **Q:** Visual refinement after first review: how should the symbols, colours, randomness, and 3D feel change?
  **A (user, 2026-11-23):** Make it random every time while following a basic pattern, switch to Matrix-style symbols and pure Matrix green colours (no blue/white mix), and make it clearly 3D swirling around the vibecoder.

## Open questions

## Verification

- Req 1, 7: `node scripts/harness/generate-chapter.mjs --verify` (0 deaths), `node scripts/harness/property-tests.mjs`, `npm run quality`.
- Req 2, 3, 4: `window.__stage.selfCheck()` in headless Chrome / browser check (no stage errors, every `FX_IDS` preset played, untargeted and targeted `VIBECODER_ACTION` events verified).
- Req 5, 6: `npm run procgen:fx -- --sheet`, `npm run procgen:selftest`, `node scripts/harness/asset-usage.mjs`, `npm run quality:fingerprint` (explain the intentional addition of the new FX preset).
- Spec gate: `node scripts/quality/check-specs.mjs`.
