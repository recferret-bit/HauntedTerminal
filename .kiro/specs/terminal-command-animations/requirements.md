# Terminal command animations: requirements

Status: done (2026-11-24; see docs/qa/2026-11-24-terminal-command-animations.md for the known caveats)

Capability: the existing green Matrix glyph swirl (`fx.matrix-cast`) keeps playing around the vibecoder for every command that succeeds. A failed command plays a red variant instead (the same swirl in red plus a red glitch-block layer), and the hero plays a different pose. A failed command never plays the green swirl.

Rewritten 2026-11-23 after the user's correction. The first draft assumed no matrix animation existed and proposed a DOM glyph rain in `src/ui`. That was wrong: the swirl exists (spec `.kiro/specs/terminal-matrix-feedback/`, done). This spec is an addition to it, in the 3D stage, not in `src/ui` or `src/styles`.

## What exists today (read from the code, 2026-11-23)

- `fx.matrix-cast`: `src/procgen/fx/presets.ts` (3 `orbit` layers `stream`/`trail`/`head`, zones `matrixBright`/`matrixDark`/`matrixGlow`, 680 ms, 15 fps, `wrapActor`, no word). Moment `'matrix-cast'` in `src/procgen/fx/types.ts`, `null` word in `src/procgen/fx/catalog.ts`. Listed in `FX_IDS` (`src/renderer/fx-player.ts`).
- Trigger: `fxCuesFor` in `src/renderer/event-fx.ts` returns `[cue('fx.matrix-cast', 'vibecoder-body', 0)]` for every `VIBECODER_ACTION`, with no condition.
- Event: `VIBECODER_ACTION { action, command, targetEntityId? }` in `src/contracts/events.ts`. It carries no success or failure information.
- Both shells emit it on every non-empty command: classic `src/game/session.ts` (`events.unshift`, line ~118, where `ran.code` is in scope) and chapters `src/chapters/session-flow.ts` `exec` (fallback `action: 'type'` when the command emitted none; `step.code` comes from `runLine`). Many commands emit their own action inside `step.events` (`cat`, `rm`, `ls`, `cd`, `edit`, `kiro ...`).
- The shell already returns an exit status: `runLine` in `src/game/shell.ts` gives `code` (2 for lex or parse errors, 0 for empty input; handlers return `code`, for example 1 for `cat: No such file or directory`).
- Game refusals already exit non-zero, so no output text is needed to detect them (read from the code):
  - a `script.locks` refusal: `dispatch` in `src/chapters/session-shell.ts` returns `emptyStep(1, message)`;
  - a wrong riddle answer: `labRiddleWrite` in `src/game/lab-riddle.ts` returns `empty(1, ...)`;
  - `Permission denied`, `Is a directory` and similar: `emptyStep(1, ...)`.
- Red in the art palette: `lockRed` (`#ef233c`, family `signal`, emissive 0.5) in `src/procgen/core/palette.ts`. The green has a bright, glow and dark triple; red has only `lockRed`.
- No `prefers-reduced-motion` handling exists in `src/renderer/` or `src/procgen/`, so today's green swirl does not honour it either.

## Requirements

Definition used below: a command **failed** when its exit status (`step.code` in the chapters shell, `ran.code` in the classic shell) is not 0. This covers: any non-zero handler exit, unknown command, syntax error, `script.locks` refusals and wrong riddle answers. It is decided from the exit status only, never from output text.

1. WHEN a command finishes with exit status 0, THE SYSTEM SHALL play `fx.matrix-cast` and the existing hero action exactly as today.
2. WHEN a command finishes with a non-zero exit status, THE SYSTEM SHALL play the red variant (requirement 5) at `vibecoder-body`, following the hero, and the failure pose (requirement 7), and SHALL NOT play `fx.matrix-cast` for that command.
3. THE SYSTEM SHALL add an optional `failed?: boolean` to `VIBECODER_ACTION` in `src/contracts/events.ts`. In both shells, at the one place each builds the command's events, THE SYSTEM SHALL set `failed: true` on every `VIBECODER_ACTION` of a command whose exit status is not 0, including actions a handler emitted itself and the fallback `type` action. A command that exits 0 SHALL carry no `failed` field. `fxCuesFor` SHALL choose the preset from `failed`, so a failed command yields one cue and never a green one.
4. THE SYSTEM SHALL NOT read output text (`stdout`, `stderr`, messages) to decide failure. A refusal that exits 0 (none is known today) is not an error until it is changed to a non-zero exit by its owner.
5. THE SYSTEM SHALL define the red variant as a declarative `FxPreset` in `src/procgen/fx/` registered in `FxCatalog`, listed in `FX_IDS`, with a new `FxMoment`, `null` in `FX_MOMENT_WORDS`, and no onomatopoeia word. It SHALL have the same orbit swirl as `fx.matrix-cast` in red, plus a short red `glitch` block layer (like `fx.coredump`).
6. THE SYSTEM SHALL add a red palette triple in `src/procgen/core/palette.ts` mirroring the matrix greens (a bright, a glow and a dark zone; names fixed in the design, for example `faultBright`, `faultGlow`, `faultDark`), and every red particle colour SHALL come from palette zones. Existing zones and every model that uses them SHALL stay unchanged.
7. WHEN `VIBECODER_ACTION` has `failed: true`, THE SYSTEM SHALL play on the hero a failure pose that is different from the action pose of a successful command: a stage-driven flinch (`heroFlinch` in `stage-motion.ts`, 360 ms, 12 steps per second, additive on the hero's offset and body lean, restored at the end), written like the existing `heroEmote` cases. It adds no `anim:` tag and no animator state, does not claim the hero's animator, and replaces the walk-to-target and `attack` of the success path (revised at the design gate, 2026-11-23; see Decisions).
8. THE SYSTEM SHALL add a stage-wide reduced-motion switch in the 3D stage that follows `prefers-reduced-motion: reduce` (read once and on change). WHILE it is on, THE SYSTEM SHALL NOT play the green swirl, the red swirl, the red glitch layer or the failure flinch; a successful command keeps its existing hero hop and attack (decided at the design gate). In their place the hero SHALL get a short static tint, green for success and red for failure (about 300 ms, no orbiting, no jitter, no motion), so the result stays readable. This covers the existing green swirl (decided in this spec; proposed yes, see Decisions). Other effects (hits, deaths, gate, lightning) are out of the switch's scope here.
9. THE SYSTEM SHALL pass `validateFxPreset` and `validateFxCatalog` for the new preset (60/30/10 role area balance, CIE76 colour separation, particle and triangle budgets, stepped timing, extent, no lingering particles), pass `npm run procgen:fx`, and show the preset in `/storybook.html?tab=fx`.
10. THE SYSTEM SHALL keep every existing model, texture and FX fingerprint line byte-identical, except the added lines for the new palette zones and the new preset (the flinch is stage code and adds no fingerprint line; revised at the design gate), and SHALL keep headless chapter playthroughs at 0 deaths.
11. WHILE the stage runs in a Terminal Lab or preview session, THE SYSTEM SHALL play the same green and red variants, the pose and the reduced-motion behaviour as in normal play, and SHALL record the same results as before. Terminal Lab transcripts (`transcriptOf`) and headless runs SHALL stay byte-identical for existing labs (the new field is only on events; transcripts hold event types only, so no lab file changes and `terminal-designer` has no work; decided in the design).

## Out of scope

- Any DOM, CSS or `src/ui` animation (dropped).
- An onomatopoeia word on either swirl (the earlier decision of `terminal-matrix-feedback` stands).
- Changing the green swirl's look, the hero hop, or event effects such as `fx.hop`, `fx.sigkill`, `fx.gate-open`.
- Damage and death events: they already have their own effects.
- Reduced-motion handling for effects other than the two swirls, the glitch layer and the failure pose.

## Owners (proposed, confirmed at the design gate)

- `artist`: `src/procgen/core/palette.ts`, the preset, `FxMoment`, catalog, `FX_IDS`, `src/renderer/event-fx.ts`, `fx-player.ts`, the failure pose (`src/procgen/anim`, `stage-motion.ts`), the reduced-motion switch and tint, storybook.
- `lead-dev`: the contract `src/contracts/events.ts` and the classic stamp in `src/game/session.ts` (cross-cutting code under this spec), plus steering and docs.
- `chapters-designer`: the chapters stamp in `src/chapters/session-flow.ts` and the property in `scripts/harness/props/gameplay.mjs`.
- `terminal-designer`: only if a Terminal Lab file under `src/terminal-lab/` needs a change for requirement 11 (the design decides).
- `qa`: verifies in real Chrome, with and without reduced motion, and in a lab.

## Decisions

- **Correction (user, 2026-11-23):** the animation already exists as `fx.matrix-cast`. The green swirl stays for normal commands; wrong commands and errors play a second, red variant instead, never green. The spec is rewritten on that basis; the DOM glyph-rain, `typeOut`, `src/ui` / `src/styles` ownership and the "no artist work" idea are dropped.
- **Dropped Round 1 answers** (delegated recommendations built on the DOM idea): "both new", "same glyph rain over the terminal pane", "`--fault` and phosphor, terminal-designer in `src/ui`".
- **Q1 (user, 2026-11-23):** ALL, options A, B and C all count as errors: non-zero exit, game refusals that exit 0, unknown command and syntax error. Resolution by the lead from the code: every one of these already exits non-zero (`script.locks` refusals and wrong riddle answers exit 1; unknown command and syntax error exit non-zero), so one rule, "exit status is not 0", covers all of them with no output-text matching. No question needed; if a refusal that exits 0 is found later, its owner changes it to a non-zero exit.
- **Q2 (user, 2026-11-23):** A. A new optional `failed?: boolean` on `VIBECODER_ACTION` in `src/contracts/events.ts`, stamped in both shells. This is a contract change; the user's yes to it is recorded here.
- **Q3 (user, 2026-11-23):** C. The same swirl plus a red glitch-block layer.
- **Q4 (user, 2026-11-23):** A. A red triple palette (bright, glow, dark) like the matrix greens, in `src/procgen/core/palette.ts`.
- **Q5 (user, 2026-11-23):** B. The hero plays a different pose on failure.
- **Q6 (user, 2026-11-23):** B. A stage-wide reduced-motion switch (`prefers-reduced-motion`) in the 3D stage. Proposed in this spec, for the user's approval: it also covers the existing green swirl (yes), and a short static tint (green or red, about 300 ms) replaces the animation.
- **Q7 (user, 2026-11-23):** A. Terminal Lab and preview sessions play the red variant too.

- **Requirements approval (user, 2026-11-23):** the user explicitly approved these requirements as written, including the `failed?: boolean` contract change in `src/contracts/events.ts` (Q2) and the proposed reduced-motion behaviour of Q6 (the switch also covers the existing green swirl, and a short static tint of about 300 ms replaces the animation).

- **Design approval (user, 2026-11-23):** the user explicitly approved `design.md` as written, including its five flagged decisions: (1) Terminal Lab: no change, because transcripts hold event types only; (2) the failure pose has no `anim:` tag (a stage tween, `heroFlinch`), so requirements 7 and 10 are reworded above and the fingerprint gains no pose line; (3) the flinch happens on failure only, and a failed command does not walk to its target, enter `attack` or give an `ls` light ping; (4) a successful command keeps its hero hop and attack under reduced motion and only loses the swirl (a green tint replaces it); (5) the palette hexes are proposals, settled by the validators.

## Open questions

## Verification

- Req 1-4: a property in `scripts/harness/props/gameplay.mjs` ("every `VIBECODER_ACTION` of a command with non-zero exit carries `failed: true`, and none of a command with exit 0 does"), covering a lock refusal, a wrong riddle answer, an unknown command and a syntax error; `node scripts/harness/property-tests.mjs --only gameplay,terminal`; a cue unit check that `fxCuesFor` never returns `fx.matrix-cast` for a failed action and returns exactly one cue.
- Req 5, 6, 9: `node .kiro/skills/particle-effect-validator/scripts/validate-particles.mjs --all --strict`, `npm run procgen:fx -- --sheet`, `npm run procgen:selftest`, `node scripts/harness/asset-usage.mjs`, a storybook fx tab screenshot of both presets and a filmstrip of several seeds.
- Req 7: `node .kiro/skills/procedural-animation-3d/scripts/check-tags.mjs --all` (expected unchanged: no tag is added) and a screenshot sequence of the flinch.
- Req 8: a unit check of the switch (flag on: no swirl or pose cue, a tint cue instead; flag off: unchanged) and a real Chrome screenshot with reduced motion emulated.
- Req 10: `npm run quality:fingerprint` (diff: palette zones and one preset), `node scripts/harness/generate-chapter.mjs --verify`, `npm run quality`.
- Req 2 in the real game: `qa` types a known command and a wrong command in Chrome (`play-browser.mjs`) and looks at both screenshots (green, then red).
- Req 11: `node scripts/harness/terminal-lab.mjs --all` and `node scripts/harness/terminal-lab-smoke.mjs` transcripts unchanged; a red variant seen in a lab.
- Spec gate: `node scripts/quality/check-specs.mjs`.
