---
name: procedural-particles-3d
description: "[ASSET PCG] Author comic hit effects as plain-data `FxPreset`s in `src/procgen/fx`: bursts, shards, dust, sparks, ice, ink splashes, glitch blocks and onomatopoeia words (HOP!, CLANK!, SIGKILL!, KRAKOOM!) that answer a shell command or KernelEvent, drawn as low-poly ink-outlined chunks by the comic material. Use whenever you add or tune a particle effect, impact, pickup burst, damage or death effect, screen shake or flash amount, onomatopoeia lettering, or when a new command or event needs visual feedback. Always pair with `particle-effect-validator`."
---

# Comic effects (`src/procgen/fx`)

Read [haunted-art-direction](../haunted-art-direction/SKILL.md) first. This skill is about one thing:
what happens on the page in the half second after the player presses Enter.

## What an effect is here

A comic does not simulate smoke. It draws **a pose, a word and a shake**:

1. **One big shape that lands on the first frame.** A starburst, a bolt, a ring, a blot. It is drawn
   oversized for one frame, settles, and is gone in three.
2. **A handful of chunks thrown from it.** 5 to 14 shards, pixels, drops or glyphs: things you can
   count. They are real low-poly geometry with the same 0.028 ink shell and cel bands as the actors,
   so the effect sits in the same world.
3. **A few bright marks.** Sparkles, speed lines, embers. The accent.
4. **The word**, lettered in a 5-row pixel font, popping on at the same frame.
5. **A number for the camera**: `shake`, and `flash` for the hits that light the room.

Everything is **stepped**: time is snapped to 12 frames per second, scale and opacity are a few held
keys with no interpolation, and the whole thing is over in 150 to 1500 ms. A smooth fade or a
60 fps fountain of specks is the look of a different game. The orthographic camera looks straight
at the page, so all motion is **in the page plane**; there is no z velocity to author.

## Files

```
src/procgen/fx/
  types.ts  shapes.ts  lettering.ts   FxPreset / FxLayer; the chunk helpers (fxStarburst, fxShard, fxBolt...); the word as geometry
  simulate.ts                         fxSimulate(preset, seed, tMs): pure, closed form, stepped
  catalog.ts  presets.ts              FxCatalog, FX_MOMENT_WORDS; the 23 shipped presets
  validate.ts  preview.ts             validateFxPreset, FX_LIMITS; fxRenderFrame for the filmstrip
  emitter.ts                          createFxEmitter(preset, opts) -> { group, update(dtMs), done, dispose() }
```

Full field reference: [fx-schema.md](./references/fx-schema.md). Every shipped preset and what it is
for: [preset-catalog.md](./references/preset-catalog.md).

## Page space

Presets are authored **as seen on the page**: `+x` is screen-right, `+y` is up, angles are degrees
counter-clockwise from screen-right (90 is up). Units are world units, 58 px each at game scale; the
hero is 1.6 tall. World `+x` is screen-left, so `createFxEmitter` mirrors x for you. Never
pre-mirror a preset.

## Roles and colour: 60 / 30 / 10

Every layer has a `role`. By emitted area (count x silhouette x peak scale), the validator wants
roughly 60% `primary`, 30% `secondary`, 10% `accent` (bands 40..85 / 8..45 / 2..25).

- `primary` is the mass and carries the meaning colour: red = denied, amber = power, green = open.
- `secondary` is the material that broke: solder grit, gold contacts, hoodie threads, pcb chips. It
  must be at least ΔE 15 (CIE76) from the primary or the two read as one colour in motion.
- `accent` is the smallest and brightest: `paper` glints, a `signal` tick, the `malwareEye` yellow.
- The primary must stand off every floor backdrop (ΔE 25). `ink` is exempt because ink chunks get a
  **paper keyline** instead of an ink outline: that is how ash, ink splashes and frame shards stay
  readable in a dark room.

Zones only, from `ZONES` in `src/procgen/core/palette.ts`. Never a hex.

## The family rule: who may use which colours

Colour is the first gameplay read, so an effect inherits the palette family of whoever caused it:

| `family` | Allowed zone families | Use for |
|---|---|---|
| `system` | `neutral` `signal` `hardware` `glass` | The shell and the machine: doors, signals, pickups, files, the flood, lightning |
| `malware` | `neutral` `hardware` `malware`, at least one `malware` zone | Anything a hostile thing does or suffers |
| `hero` | `neutral` `human` `signal` | The developer: his lantern, his damage |

A SIGKILL is a `system` effect even when it kills malware: the signal is the system talking. The
enemy's own death (`fx.malware-death`) is `malware`. Do not use magenta or violet for anything
friendly, including `/dev/null`.

## Onomatopoeia

The word is part of the preset (`onomatopoeia: { text, zone, style, holdMs, offset?, size? }`), not a
DOM overlay, so it is validated and drawn with everything else.

- **Text**: upper-case, at most 18 characters, ends in `!` when it is a hit. A lower-case `x` is
  allowed only as a multiplier (`x3`). Words the design doc fixes are in `FX_MOMENT_WORDS` and are
  enforced verbatim. Amounts are passed per emission: `createFxEmitter(preset, { text: '+64GB' })`.
- **Style** mirrors `BubbleStyle` in `src/contracts/events.ts`:

| `style` | Bubble mood | Motion | Use for |
|---|---|---|---|
| `burst` | `COMIX_CLASSIC` | 1.3x on frame 1, settles, tilted 6° | Hits, pickups, good news |
| `jagged` | `JAGGED_SCREAM` | Rattles one pixel every step, alternating tilt | Damage, denial, rage, thunder |
| `whisper` | `GHOST_WHISPER` | Small, 60% opaque, drifts up | Hidden things, quiet notes |
| `glitch` | `KERNEL_GLITCH` | Sideways slips, drops out every fourth step | Kernel, corruption, crashes |

- **Placement**: `offset` is the centre of the word from the effect origin. Put it beside or above
  the big shape, never on it, and inside the panel. Words longer than 10 characters break once.
- **Hold**: 300 to 1400 ms. The word may outlive the particles; it pops on and cuts off, never fades.
- **Colour**: the meaning colour of the event, from the same family as the layers. If it sits near a
  shape of the same zone, use `paper`.

## Event to effect

| Game moment | Preset | Word |
|---|---|---|
| `ROOM_TRANSITION`, ordinary `cd` | `fx.hop` | HOP! |
| `ROOM_TRANSITION`, `upwardPanelsSmashed >= 3` | `fx.panel-smash` | PANEL SMASH x3! |
| `ROOM_TRANSITION`, `viaSymlinkLoop` (flood rises) | `fx.flood-splash` | SPLASH! |
| `PERMISSION_DENIED_RATTLE` | `fx.permission-denied` | PERMISSION DENIED! |
| `INODE_MODE_CHANGED`, gate opens | `fx.gate-open` | CLANK! |
| `LANTERN_REVEAL` | `fx.reveal` | REVEAL! |
| `OBJECT_MOVED` | `fx.mv-dust`, or `fx.devnull-suck` when `suckedIntoNull` | |
| `SYSTEM_HAND_SPAWN` | `fx.fork-spawn` | FORK()! |
| `PROC_SIGNALED` `KILLED` / `FROZEN` / `TRAPPED_ENRAGED` | `fx.sigkill` / `fx.sigstop-ice` / `fx.sigterm-rage` | SIGKILL! / FROZEN! / SIGTERM IGNORED! |
| `PUZZLE_DOOR_RESOLVED` | `fx.door-unlock` | UNLOCKED! |
| `PLAYER_DAMAGED` | `fx.hit-hero` | -10HP (pass the amount) |
| `rm`, `touch` (no event yet) | `fx.rm-ash`, `fx.touch-materialize` | |
| Pickups | `fx.pickup-energy` `fx.pickup-ram` `fx.pickup-ssd` | +25HP, +16GB, +256GB (pass the amount) |
| Enemy hit / removed | `fx.malware-hit`, `fx.malware-death` | SEGFAULT! |
| Lightning (intro, storm, kill bolt) | `fx.lightning-strike` | KRAKOOM! |
| Kernel breaks, hero dies | `fx.coredump` | COREDUMP! |

Look a preset up by moment with `FxCatalog.forMoment('sigkill')`. The game's `ComicStage.handleEvent`
(`src/renderer/comic-stage.ts`) plays them through `src/renderer/fx-player.ts`; the event → preset
table is `fxCuesFor()` in `src/renderer/event-fx.ts`. Add a row there when a new event needs an effect.
Wiring recipe for other hosts (the cinematics use it too): [emitter-usage.ts](./examples/emitter-usage.ts).

## Adding or changing a preset

1. **Name the moment.** Add it to `FxMoment` in `types.ts` and to `FX_MOMENT_WORDS` in `catalog.ts`
   (with the design-doc word, or `null`). The catalog check fails until exactly one preset answers it.
2. **Pick the family** from who causes it, then three zones: meaning, material, glint.
3. **Write the preset** in `presets.ts`, starting from the closest existing one. Reuse the key
   tracks at the top of the file (`POP`, `CHUNK`, `PUFF`, `RING`, `TWINKLE`). Worked example with the
   reasoning for every number: [worked-preset.ts](./examples/worked-preset.ts).
4. **Validate**: `npm run procgen:fx`. Fix every error; read every warning.
5. **Render the filmstrip and look at it**:
   `node .kiro/skills/particle-effect-validator/scripts/validate-particles.mjs fx.your-id --sheet --cols 1`
   then open `scripts/harness/out/fx.png`. Frame 1 must already be the hit. If you squint and see a
   fountain, cut the count in half and double the chunk size.
6. **Self-test and type-check**: `npm run procgen:selftest`, `npx tsc --noEmit`.
7. **See it under the real shaders**: `npm run dev`, then `/asset-lab.html?tab=fx` plays every preset
   (`&inspect=fx.<name>` for one). Elsewhere, mount one with `createFxEmitter` and scrub it with `seek()`.
8. Update [preset-catalog.md](./references/preset-catalog.md).

## Mistakes this skill exists to prevent

- Sprites, `THREE.Points`, additive glow, smooth alpha fades, per-frame `Math.random()`.
- Dozens of specks with no big shape (`FX_NO_BIG_SHAPE`, `FX_BUDGET`).
- An effect that grows in. The first frame is the strongest frame (`FX_POP`, `FX_NO_POP`).
- Friendly effects in malware colours, or a hex colour anywhere.
- Motion toward the camera. It is invisible; use scale keys for "toward you".
- A word that is a sentence. If it does not fit in 18 characters it belongs in a speech bubble.
