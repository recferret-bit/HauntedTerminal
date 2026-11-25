# Terminal command animations: design

Follows `requirements.md` (requirements approved by the user 2026-11-23). Every claim below about existing code was read from the repository on 2026-11-23; nothing was run except `node scripts/quality/check-specs.mjs`.

## Data flow

```
shell exit status ──> session stamps `failed: true` on each VIBECODER_ACTION  (classic: session.ts, chapters: session-flow.ts)
                 └──> KernelEvent (src/contracts/events.ts, `failed?: boolean`)
                         └──> stage-events.ts: fxCuesFor(ev)  -> fx.matrix-cast (success) | fx.matrix-fault (failed)
                         └──> stage-event-cast.ts: onVibecoderAction -> heroAction (success) | heroFlinch (failed)
                         └──> reduced-motion switch (stage.reducedMotion) swaps swirl, glitch and flinch for a 300 ms tint
```

## Owners per file

| File | Change | Owner |
|---|---|---|
| `src/contracts/events.ts` (line ~187, `VIBECODER_ACTION`) | add `failed?: boolean` with a doc comment (set only when the command exited non-zero) | `lead-dev` |
| `src/game/session.ts` (line ~118, the `events.unshift` of the action) | add `failed: true` when `ran.code !== 0`; no field when 0 | `lead-dev` |
| `src/chapters/session-flow.ts` (line ~133, `actionEvents`) | when `step.code !== 0`, set `failed: true` on every `VIBECODER_ACTION` in `step.events` and on the fallback `type` action | `chapters-designer` |
| `scripts/harness/props/gameplay.mjs` | the stamping property (see Validators) | `chapters-designer` |
| `src/procgen/core/palette.ts` | three zones `faultBright`, `faultGlow`, `faultDark` | `artist` |
| `src/procgen/fx/presets.ts`, `types.ts` (`FxMoment` `'matrix-fault'`), `catalog.ts` (`FX_MOMENT_WORDS` `'matrix-fault': null`) | preset `fx.matrix-fault` | `artist` |
| `src/renderer/fx-player.ts` | add `'fx.matrix-fault'` to `FX_IDS` | `artist` |
| `src/renderer/event-fx.ts` | `fxCuesFor` chooses by `ev.failed`; `eventLeadMs` returns 0 for a failed action; the "28 presets" comment becomes 29 | `artist` |
| `src/renderer/reduced-motion.ts` (new file in an existing area) | the switch | `artist` |
| `src/renderer/comic-stage.ts` (353 lines) | owns one switch instance, `stage.reducedMotion` | `artist` |
| `src/renderer/stage-events.ts`, `stage-event-cast.ts`, `stage-motion.ts` (498 lines) | cue substitution, flinch, tint | `artist` |
| `src/renderer/stage-selfcheck.ts` | one failed action in `allEvents()` (required, see below) and the cue and switch checks | `artist` |
| `src/storybook/` | show `fx.matrix-fault` in the fx tab if the tab does not list `FX_IDS` automatically (checked when implementing) | `artist` |
| `src/terminal-lab/` | **no change** (see Terminal Lab) | none |
| steering and docs: a pointer line in `.kiro/specs/terminal-matrix-feedback/`, status of this spec | | `lead-dev` |

No new `src/<area>/`, no page, no layer rule, no dependency. `reduced-motion.ts` sits in `renderer/`, which already may use the DOM and `procgen`. No new file is needed in `src/game` or `src/chapters`, so no ownership row changes (a new file there would be unowned and fail `quality:agents`).

## Contract change

```ts
// src/contracts/events.ts
{ type: 'VIBECODER_ACTION'; action: ...; command: string; targetEntityId?: string;
  /** Set (true) only when the command exited with a non-zero status. Absent means success. */
  failed?: boolean; }
```

Both shells write the field only when true, so events of successful commands are byte-identical to today (requirement 3).

## Stamping in both shells

- **Classic** (`session.ts`): `exec` already has `ran.code` in scope when it builds the one action (`events.unshift({ type: 'VIBECODER_ACTION', action: this.act.action, ... })`). The object gets `...(ran.code !== 0 ? { failed: true } : {})`. Verified: the only `VIBECODER_ACTION` producer under `src/game/` is this line, so the classic shell has exactly one action per command.
- **Chapters** (`session-flow.ts`): `exec` builds `actionEvents` from `step.events` (handlers emit their own actions: `cat`, `rm`, `ls`, `edit`, `kiro ...`, code and compose steps) or prepends the fallback `type` action. The design adds one small function in that file that maps `step.events`, copying each `VIBECODER_ACTION` with `failed: true` when `step.code !== 0`. It is applied to both branches, so handler actions and the fallback are covered. Actions pushed later in the same call (Kiro crack steps, ticks) are not part of the command and stay unmarked.
- The two stamps differ in shape (one object literal, one map over an array), so they add no duplicated block. No shared helper file is created.
- Early returns that never reach these lines (the `restart` path, the "Issue complete" refusal in a finished chapter) emit no action today and still play no swirl. That is unchanged and out of scope.

## Palette: the red triple

Added in `palette.ts` next to the matrix zones, mirroring them (bright, glow, dark):

| Zone | Proposed value | Family, emissive | Mirrors |
|---|---|---|---|
| `faultBright` | `0xe8002b` | `signal`, 0.35 | `matrixBright` (`0x00e82b`) |
| `faultGlow` | `0xff7a8a` | `signal`, 0.45 | `matrixGlow` (`0x6dff86`) |
| `faultDark` | `0x7a0018` | `hardware`, 0.08 | `matrixDark` (`0x006b1b`, `hardware`) |

The values are a proposal: the artist fixes the exact hexes under the validators (CIE76 separation between the three, and from `lockRed` `0xef233c`, which stays the "door says no" colour and is unchanged). The families copy the matrix triple's families; if a validator rejects `hardware` for a red, the artist picks the nearest allowed family and says so in the report. No existing zone changes, so no existing model, texture or preset fingerprint line changes.

## The red preset

`fx.matrix-fault`, family `system`, trigger `{ event: 'VIBECODER_ACTION', moment: 'matrix-fault', when: 'a command exits non-zero' }`, `anchor: 'center'`, `wrapActor: true`, `durationMs: 680`, `stepFps: 15`, no `onomatopoeia`.

- **Swirl layers.** The three `orbit` layers of `fx.matrix-cast` (`stream`, `trail`, `head`) become one function `matrixSwirlLayers(zones)` in `presets.ts`; `fx.matrix-cast` calls it with the matrix zones and `fx.matrix-fault` with `faultBright`, `faultDark`, `faultGlow`. This avoids a copy of about 20 lines that `jscpd` would flag, and keeps the green preset's data identical (same keys in the same order), so its fingerprint line must not change. If it does change, the refactor is wrong and is reverted to a literal copy with a documented `jscpd` exception request to the user.
- **Glitch layer (the one addition).** `{ name: 'glitch', role: 'accent', zone: 'faultGlow', shape: fxBlock(0.3, 0.09), emit: 'line', spawn: { width: 1.6, height: 1.6 }, angle: [0, 0], speed: [0.5, 2], drag: 6, delayMs: [0, 320], lifeMs: [120, 260], size: [0.7, 1.4], scale: [[0, 1], [0.5, 0.6]], count: 6 }`. It follows the `glitch` layer of `fx.coredump` (`lockRed`, `fxBlock(0.3, 0.09)`, `line`), scaled down to the swirl's 680 ms and with every particle dead before the preset ends.
- **Role balance.** `head` and `glitch` are both `accent`, so together they must stay near 10% of the area. If `validateFxPreset` reports the 60/30/10 balance as off, the artist lowers `head` from 3 to 2 and the glitch `count`; the target is the validator, not these numbers.
- **Registered in** `FxCatalog` (via the `PRESETS` array), `FX_IDS`, `FxMoment`, and `FX_MOMENT_WORDS` as `null`.

## The failure pose (decision to confirm, see Flags)

`heroFlinch(stage, hero)` in `stage-motion.ts`, written like the existing `heroEmote` cases (`confused`, `relief`): a stepped tween of 360 ms at 12 steps per second that is additive on `hero.offset.x` (two quick alternating nudges of about 0.06 that decay) and `hero.body.rotation.z` (a lean of about -0.06 on the first half), restored to 0 at the end. It does not touch `hero.animator`, claim the hero or walk. It is used instead of the success path:

- `onVibecoderAction` (`stage-event-cast.ts`): `ev.failed ? heroFlinch(...) : heroAction(...)`. A failed action therefore does not walk to a target and does not enter `attack`, so a failed command never looks like a cast.
- `eventLeadMs` returns 0 for a failed action, so events after it do not wait for a walk that no longer happens.

The `ls` / `ls -a` light ping in `onVibecoderAction` keys on the command text and only runs when `ls` ran; a failed `ls` (non-zero) gets no ping. This is a consequence of the same branch and is kept deliberately: a failed command has no reveal.

## The reduced-motion switch

`src/renderer/reduced-motion.ts`:

```ts
export interface ReducedMotion { readonly on: boolean; set(on: boolean): void }
export function watchReducedMotion(): ReducedMotion
```

It reads `window.matchMedia('(prefers-reduced-motion: reduce)')` once (guarded by `typeof window.matchMedia === 'function'`, so it is off where there is no `matchMedia`) and keeps `on` updated from the query's `change` event. `set` overrides it for the stage selfcheck and tests. `ComicStage` creates one in its constructor as `stage.reducedMotion`. `comic-stage.ts` has no `dispose()`; the listener lives as long as the page, like the stage.

In `runStageEventInner` (`stage-events.ts`), for a `VIBECODER_ACTION` while `stage.reducedMotion.on`:

1. the cues are dropped (neither swirl, no glitch layer), so `playCues` gets an empty list;
2. `flashActor(stage, hero, hex, 300, 0)` runs with `hex` from `ZONES.matrixBright.color` (success) or `ZONES.faultBright.color` (failure), both palette zones; `flashActor` already restores each material's colour and calls `retint()` afterwards;
3. `onVibecoderAction` skips `heroFlinch`. A successful command keeps its existing `heroAction` (the hop and attack are out of scope, as the requirements say).

The switch is read per event, so a change of the OS setting applies to the next command. It is not read for hits, deaths, gate or lightning (out of scope).

## Terminal Lab: the settled choice (flagged)

Requirement 11 left open whether Terminal Lab transcripts must exclude `failed` or the labs be re-baselined. Reading the code settles it with no change:

- `transcriptOf` (`src/terminal-lab/runner.ts`) prints `r.eventTypes` (the event **types** only) plus code, hp and cwd. `StepResult.eventTypes` is built with `res.events.map((e) => e.type)` in `runStep`. `expect.events` / `noEvents` match types. So a new field on an event cannot change a transcript, and no committed lab needs re-baselining.
- The only place that serialises a whole event is the lab's Events inspector (`src/terminal-lab/inspect-panels.ts` line 109, `JSON.stringify(ev, null, 2)`). It will show `"failed": true` for a failed command, which is correct and useful in a lab.
- Result: **no file under `src/terminal-lab/` or `scripts/harness/terminal-lab/` changes, and `terminal-designer` has no work.** The lab's stage is the real game stage in an iframe, so it plays both swirls, the flinch and the reduced-motion behaviour (requirement 11) with no lab code.
- This was verified by reading, not by running the lab suites; they run at implementation (below).

## Validators and gates

Per requirement (what runs when each piece is done):

| Piece | Gate |
|---|---|
| contract and stamps | `npm run quality` (the `tsc` typecheck covers every `VIBECODER_ACTION` consumer); `node scripts/harness/property-tests.mjs --only gameplay,terminal`; `node scripts/harness/generate-chapter.mjs --verify` |
| stamping property | in `props/gameplay.mjs`, inside the existing `watch(levelIdx, steps, (_s, _b, r, step) => ...)` pattern: for every executed command, if `r.code !== 0` every `VIBECODER_ACTION` in `r.events` has `failed === true`, otherwise none has the field. The generated steps need to include a refused lock, a wrong riddle answer, an unknown command and a syntax error; the chapters designer adds a fixed list of such lines to the step arbitrary and keeps any counterexample in `examples`. A property that never sees a non-zero exit cannot fail, so the property must also assert it saw at least one |
| palette and preset | `node .kiro/skills/particle-effect-validator/scripts/validate-particles.mjs --all --strict`, `npm run procgen:fx`, `npm run procgen:selftest`, `node scripts/harness/asset-usage.mjs`, a storybook fx tab screenshot of both presets and a filmstrip over several seeds |
| flinch | `node .kiro/skills/procedural-animation-3d/scripts/check-tags.mjs --all` (expected unchanged: no tag is added), a screenshot sequence of the flinch |
| cues and switch | `stage-selfcheck.ts`: `allEvents()` must contain a failed action, because the selfcheck fails on any `FX_IDS` entry that was never played (`missingFx`); plus checks that `fxCuesFor` of a failed action returns exactly one cue and never `fx.matrix-cast`, and that with `stage.reducedMotion.set(true)` the swirl and glitch cues are dropped and the tint runs. `fxCuesFor` stays a pure function of the event, so the property runner (Node, no TypeScript import) cannot test it, which is why the browser selfcheck carries it |
| fingerprint | `npm run quality:fingerprint`: the diff is limited to three palette zones and one preset; any change to an existing line fails the task |
| Terminal Lab | `node scripts/harness/terminal-lab.mjs --all`, `terminal-lab-unit.mjs`, `terminal-lab-smoke.mjs` unchanged, with a red swirl seen in a lab |
| real game | `qa`: types a good and a wrong command in Chrome and looks at both screenshots; repeats with reduced motion emulated through DevTools `emulate`, and in a lab |
| spec | `node scripts/quality/check-specs.mjs`, `npm run quality` |

## Flags for the user (please decide at this gate)

1. **Terminal Lab: no change.** `failed` never reaches a transcript because transcripts hold event types only. Chosen over "exclude the field" and "re-baseline". Say so if you want the lab to show failure differently (for example a transcript marker); that would be new `terminal-designer` work.
2. **The failure pose has no `anim:` tag.** Requirement 7 says "with an `anim:` tag and animator state valid under `procedural-animation-3d`". The design uses a stage tween (like `heroEmote`), because the hero's `hit` state is already the damage read and a new state or tag would change the `vibecoder.*` model fingerprint. The consequence: no tag or state is added, and `check-tags.mjs` has nothing new to check. Requirement 10's "one pose" fingerprint line then does not exist. If you want a real tag or the `hit` state instead, the requirement text stays and the fingerprint grows by that line.
3. **A failed command does not walk to its target or enter `attack`.** It only flinches, and a failed `ls` gives no light ping.
4. **Success under reduced motion** keeps the hero hop and attack, and only loses the swirl (a green tint replaces it).
5. **Colour values** in the palette table are proposals; the validators decide the final hexes and families.
